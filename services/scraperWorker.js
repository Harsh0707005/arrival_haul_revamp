const { parentPort, workerData } = require('worker_threads');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const { URL } = require('url');

const productIdentifiers = require('../utils/product_identifiers.json');

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

async function scrapeProduct(product) {
    try {
        const domain = extractDomain(product.url);
        if (!domain || !productIdentifiers[domain]) {
            return { success: false, error: `No scraping rules found for domain: ${domain}` };
        }

        const rules = productIdentifiers[domain];
        const html = await getHtmlContent(product.url, rules.loads_with_js);
        
        if (!html) {
            return { success: false, error: `Failed to fetch content for: ${product.url}` };
        }

        const $ = cheerio.load(html);
        
        if (!$(rules.product_page_validator).length) {
            return { success: false, error: `Not a valid product page: ${product.url}` };
        }

        const extractedData = extractData($, rules, product.url);

        const favicon = $('link[rel="icon"], link[rel="shortcut icon"]').attr('href');
        const websiteLogo = favicon ? new URL(favicon, product.url).href : '';

        const priceData = extractPrice(extractedData.product_price, product.country);
        const numericPrice = getNumericPrice(priceData.price);

        const formattedData = {
            site_name: rules.site_name,
            product_url: product.url,
            product_id: extractedData.product_id || product.id.toString(),
            product_name: extractedData.product_name || product.name,
            product_unique_id: extractedData.product_unique_id || '',
            product_description: extractedData.product_description || product.description,
            product_country: {
                country_id: product.country.id.toString(),
                country_name: product.country.name,
                country_code: product.country.code,
                currency: product.country.currency,
                currency_symbol: product.country.currencySymbol,
                mobile_code: product.country.mobileCode
            },
            product_price: priceData.price,
            product_images: extractedData.product_images || product.images || [],
            product_brand_name: extractedData.product_brand_name || product.brand?.name || '',
            product_category: extractedData.product_category || product.category?.name || '',
            product_subcategory: extractedData.product_subcategory || '',
            website_logo: websiteLogo
        };

        if (
            formattedData.product_price !== '' &&
            numericPrice > 0 &&
            formattedData.product_name !== '' &&
            formattedData.product_description !== '' &&
            formattedData.product_url !== ''
        ) {
            return {
                success: true,
                data: formattedData,
                numericPrice,
                productId: product.id
            };
        } else {
            return { success: false, error: 'Missing required fields' };
        }

    } catch (error) {
        return { success: false, error: error.message };
    }
}

parentPort.on('message', async (product) => {
    const result = await scrapeProduct(product);
    parentPort.postMessage(result);
}); 