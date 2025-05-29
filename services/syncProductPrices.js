const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const puppeteer = require('puppeteer');
const { Worker } = require('worker_threads');
const os = require('os');

const prisma = new PrismaClient();

const productIdentifiers = require('../utils/product_identifiers.json');

const NUM_WORKERS = Math.max(1, os.cpus().length - 1);

function extractDomain(url) {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname;
    } catch (error) {
        console.error(`Error parsing URL: ${url}`, error);
        return null;
    }
}

async function getHtmlContent(url, loadsWithJs, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            if (loadsWithJs) {
                const browser = await puppeteer.launch({ 
                    headless: 'new',
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                await page.goto(url, { 
                    waitUntil: 'networkidle0',
                    timeout: 30000 
                });
                const content = await page.content();
                await browser.close();
                return content;
            } else {
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Connection': 'keep-alive',
                    },
                    timeout: 30000,
                    validateStatus: function (status) {
                        return status >= 200 && status < 500;
                    }
                });

                if (response.status === 404) {
                    console.log(`Product not found (404): ${url}`);
                    return null;
                }

                if (response.status !== 200) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                return response.data;
            }
        } catch (error) {
            console.error(`Attempt ${attempt} failed for ${url}:`, error.message);
            if (attempt === retries) {
                console.error(`All retry attempts failed for ${url}`);
                return null;
            }
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
    }
    return null;
}

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/<[^>]*>/g, '')
        .replace(/[{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractPrice(text, country) {
    if (!text) return { price: '', country: null };
    
    const priceRegex = /([₹$€£¥])?\s*([\d\s,]*\.?\d+)\s*([₹$€£¥])?/;
    const match = text.match(priceRegex);
    
    if (match) {
        const currency = match[1] || match[3] || '';
        let price = match[2].replace(/\s/g, '');
        
        if (currency === '€' || currency.toLowerCase() === 'kr') {
            price = price.replace(/\./g, '').replace(/,/g, '.');
        } else {
            const parts = price.split('.');
            if (parts.length > 2) {
                const lastPart = parts.pop();
                price = parts.join('') + '.' + lastPart;
            }
            price = price.replace(/,/g, '');
        }
        
        const expectedCountry = country;
        const finalCurrency = currency || country.currencySymbol;
        
        return {
            price: `${finalCurrency} ${price}`,
            country: expectedCountry
        };
    }
    
    return { price: '', country: null };
}

function getNumericPrice(priceStr) {
    if (!priceStr) return 0;
    const match = priceStr.match(/([\d\s,]*\.?\d+)/);
    if (match) {
        try {
            let price = match[1].replace(/\s/g, '');
            const parts = price.split('.');
            if (parts.length > 2) {
                const lastPart = parts.pop();
                price = parts.join('') + '.' + lastPart;
            }
            price = price.replace(/,/g, '');
            return parseFloat(price);
        } catch {
            return 0;
        }
    }
    return 0;
}

function extractData($, selectors, url) {
    const data = {};
    
    const nonSelectorFields = ['loads_with_js', 'site_name', 'product_page_validator'];
    
    for (const [key, selector] of Object.entries(selectors)) {
        try {
            if (nonSelectorFields.includes(key)) {
                continue;
            }

            if (key === 'product_id' && selector.includes('response.url')) {
                data[key] = url.split('/').pop();
            } else if (key === 'product_url') {
                data[key] = url;
            } else if (key === 'product_images') {
                const imageUrls = [];
                $(selector.split('::')[0]).each((_, el) => {
                    const src = $(el).attr('src');
                    if (src) imageUrls.push(src.split('?')[0]);
                });
                data[key] = [...new Set(imageUrls)];
            } else if (key === 'product_country') {
                data[key] = selector;
            } else {
                const cleanSelector = selector.split('::')[0];
                const elements = $(cleanSelector);
                if (elements.length > 0) {
                    const text = elements.map((_, el) => $(el).text().trim()).get().join(' ');
                    data[key] = cleanText(text);
                } else {
                    data[key] = '';
                }
            }
        } catch (error) {
            console.log(`Error extracting ${key} with selector ${selector}:`, error);
            data[key] = '';
        }
    }
    
    return data;
}

async function scrapeProducts() {
    let writeStream;
    const BATCH_SIZE = 100;
    let skip = 0;
    let hasMoreProducts = true;
    let totalSuccessCount = 0;
    let totalFailureCount = 0;
    let totalProcessed = 0;

    try {
        writeStream = fs.createWriteStream('data.json');
        writeStream.write('[\n');
        let isFirstItem = true;

        while (hasMoreProducts) {
            const products = await prisma.product.findMany({
                where: {
                    url: {
                        not: ''
                    }
                },
                include: {
                    country: true,
                    brand: true,
                    category: true
                },
                take: BATCH_SIZE,
                skip: skip
            });

            if (products.length === 0) {
                hasMoreProducts = false;
                break;
            }

            const workers = Array.from({ length: NUM_WORKERS }, () => {
                const worker = new Worker(path.join(__dirname, 'scraperWorker.js'));
                worker.setMaxListeners(products.length);
                return worker;
            });

            const CHUNK_SIZE = Math.ceil(products.length / NUM_WORKERS);
            const chunks = [];
            for (let i = 0; i < products.length; i += CHUNK_SIZE) {
                chunks.push(products.slice(i, i + CHUNK_SIZE));
            }

            const results = [];
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const worker = workers[i % NUM_WORKERS];
                
                const chunkResults = await Promise.all(
                    chunk.map(product => 
                        new Promise((resolve) => {
                            const messageHandler = (result) => {
                                worker.removeListener('message', messageHandler);
                                resolve(result);
                            };
                            worker.on('message', messageHandler);
                            worker.postMessage(product);
                        })
                    )
                );
                results.push(...chunkResults);
            }

            await Promise.all(workers.map(worker => worker.terminate()));

            let successCount = 0;
            let failureCount = 0;

            for (const result of results) {
                if (result.success) {
                    const jsonString = JSON.stringify(result.data, null, 2);
                    if (!isFirstItem) {
                        writeStream.write(',\n');
                    }
                    writeStream.write(jsonString);
                    isFirstItem = false;

                    try {
                        await prisma.product.update({
                            where: {
                                id: result.productId
                            },
                            data: {
                                price: {
                                    set: result.numericPrice
                                }
                            }
                        });
                        console.log(`Updated price in database for product ${result.productId}: ${result.numericPrice.toFixed(2)}`);
                        successCount++;
                    } catch (dbError) {
                        console.error(`Failed to update price in database for product ${result.productId}:`, dbError);
                        failureCount++;
                    }
                } else {
                    console.log(`Failed to scrape product: ${result.error}`);
                    try {
                        await prisma.product.delete({
                            where: {
                                id: result.productId
                            }
                        });
                        console.log(`Deleted product ${result.productId} due to failed scraping`);
                    } catch (deleteError) {
                        console.error(`Failed to delete product ${result.productId}:`, deleteError);
                    }
                    failureCount++;
                }
            }

            totalSuccessCount += successCount;
            totalFailureCount += failureCount;
            totalProcessed += products.length;
            skip += BATCH_SIZE;

            console.log(`\nBatch Summary (${skip - BATCH_SIZE + 1} to ${skip}):`);
            console.log(`Successfully scraped: ${successCount}`);
            console.log(`Failed to scrape: ${failureCount}`);
        }

        writeStream.write('\n]');
        writeStream.end();

        console.log('\nFinal Scraping Summary:');
        console.log(`Total products processed: ${totalProcessed}`);
        console.log(`Total successfully scraped: ${totalSuccessCount}`);
        console.log(`Total failed to scrape: ${totalFailureCount}`);
        console.log('Data saved to data.json');

    } catch (error) {
        console.error('Error in scraping process:', error);
    } finally {
        if (writeStream) {
            writeStream.end();
        }
        await prisma.$disconnect();
    }
}

scrapeProducts(); 