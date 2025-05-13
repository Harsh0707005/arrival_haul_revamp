require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { calculatePriceDifference } = require('../services/currencyConversion');

exports.getPopularHaul = async (req, res) => {
    try {
        const { source_country_id, destination_country_id } = req.user;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const MIN_REQUIRED = pageSize;
        const MAX_ATTEMPTS = 5;

        const totalItems = await prisma.product.count({
            where: { country_id: source_country_id }
        });
        const totalPages = Math.ceil(totalItems / pageSize);

        const processedSkuSet = new Set();
        const responseProducts = [];

        let attempts = 0;

        while (responseProducts.length < MIN_REQUIRED && attempts < MAX_ATTEMPTS) {
            attempts++;

            const batchSize = pageSize * 10;

            const sourceProducts = await prisma.$queryRaw`
                SELECT * FROM "Product"
                WHERE country_id = ${source_country_id}
                ORDER BY RANDOM()
                LIMIT ${batchSize}
            `;

            const newSourceProducts = sourceProducts.filter(p => !processedSkuSet.has(p.sku_id));
            if (newSourceProducts.length === 0) break;

            const skuIds = newSourceProducts.map(p => p.sku_id);
            const destinationProducts = await prisma.product.findMany({
                where: {
                    sku_id: { in: skuIds },
                    country_id: destination_country_id
                }
            });

            const destProductMap = new Map();
            destinationProducts.forEach(p => destProductMap.set(p.sku_id, p));

            const matchedProducts = newSourceProducts.filter(p => destProductMap.has(p.sku_id));

            const enrichedProducts = await Promise.all(matchedProducts.map(async (product) => {
                const destinationProduct = destProductMap.get(product.sku_id);
                if (!destinationProduct) return null;

                const diff = await calculatePriceDifference(source_country_id, destination_country_id, product.price, destinationProduct.price);
                const swap_diff = await calculatePriceDifference(destination_country_id, source_country_id, destinationProduct.price, product.price);

                const brand = await prisma.brand.findUnique({ where: { id: product.brand_id } });
                const country = await prisma.country.findUnique({ where: { id: product.country_id } });

                return {
                    product_id: product.id,
                    sku_id: product.sku_id,
                    product_name: product.name,
                    product_description: product.description,
                    brand: brand ? brand.name : "Unknown",
                    country_name: country ? country.name : "Unknown",
                    images: [product.images[0]],
                    source_country_details: {
                        original: diff.sourcePriceOriginal,
                        converted: diff.destinationPriceConverted,
                        price_difference_percentage: diff.percentageDifference,
                        currency: diff.sourceCurrency
                    },
                    destination_country_details: {
                        original: diff.destinationPriceOriginal,
                        converted: diff.sourcePriceConverted,
                        price_difference_percentage: swap_diff.percentageDifference,
                        currency: diff.destinationCurrency
                    }
                };
            }));

            for (const enriched of enrichedProducts) {
                if (enriched && !processedSkuSet.has(enriched.sku_id)) {
                    processedSkuSet.add(enriched.sku_id);
                    responseProducts.push(enriched);
                }
                if (responseProducts.length >= MIN_REQUIRED) break;
            }
        }

        const finalResults = responseProducts.slice(0, pageSize);
        return res.json({
            currentPage: page,
            totalPages,
            pageSize,
            totalItems: finalResults.length,
            popular_haul: finalResults
        });

    } catch (err) {
        console.error("Error in getPopularHaul:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
