require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { calculatePriceDifference } = require('../services/currencyConversion');

exports.getCountryExclusiveProducts = async (req, res) => {
    try {
        const { source_country_id, destination_country_id } = req.user;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const MIN_REQUIRED = pageSize;
        const MAX_ATTEMPTS = 5;

        const destinationSkus = await prisma.product.findMany({
            where: { country_id: destination_country_id },
            select: { sku_id: true }
        });

        const destinationSkuSet = new Set(destinationSkus.map(p => p.sku_id));

        const totalItems = await prisma.product.count({
            where: {
                country_id: source_country_id,
                NOT: {
                    sku_id: {
                        in: Array.from(destinationSkuSet)
                    }
                }
            }
        });

        const totalPages = Math.ceil(totalItems / pageSize);

        const processedSkuSet = new Set();
        const responseProducts = [];
        let attempts = 0;

        while (responseProducts.length < MIN_REQUIRED && attempts < MAX_ATTEMPTS) {
            attempts++;

            const batchSize = pageSize * 10; // Page size multiplier

            const exclusiveProducts = await prisma.product.findMany({
                where: {
                    country_id: source_country_id,
                    NOT: {
                        sku_id: {
                            in: Array.from(destinationSkuSet)
                        }
                    }
                },
                include: {
                    brand: true,
                    category: true
                },
                take: batchSize,
                skip: (page - 1) * pageSize
            });

            const newExclusiveProducts = exclusiveProducts.filter(p => !processedSkuSet.has(p.sku_id));
            if (newExclusiveProducts.length === 0) break;

            const formattedProducts = await Promise.all(newExclusiveProducts.map(async (product) => {
                const diff = await calculatePriceDifference(
                    source_country_id,
                    destination_country_id,
                    product.price,
                    0
                );

                return {
                    product_id: product.id,
                    sku_id: product.sku_id,
                    product_name: product.name,
                    product_description: product.description,
                    brand: {
                        brand_id: product.brand?.id || null,
                        brand_name: product.brand?.name || null
                    },
                    category: {
                        category_id: product.category?.id || null,
                        category_name: product.category?.name || null
                    },
                    images: [product.images[0]],
                    source_country_details: {
                        original: diff.sourcePriceOriginal,
                        converted: diff.destinationPriceConverted,
                        price_difference_percentage: diff.percentageDifference,
                        currency: diff.sourceCurrency
                    },
                    destination_country_details: {}
                };
            }));

            for (const formatted of formattedProducts) {
                if (formatted && !processedSkuSet.has(formatted.sku_id)) {
                    processedSkuSet.add(formatted.sku_id);
                    responseProducts.push(formatted);
                }
                if (responseProducts.length >= MIN_REQUIRED) break;
            }
        }

        const finalResults = responseProducts.slice(0, pageSize);

        return res.json({
            currentPage: page,
            totalPages: totalPages,
            pageSize,
            totalItems: finalResults.length,
            exclusive_products: finalResults
        });

    } catch (err) {
        console.error("Error in getCountryExclusiveProducts:", err);
        res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};
