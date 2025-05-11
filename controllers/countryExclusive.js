require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { calculatePriceDifference } = require('../services/currencyConversion');

exports.getCountryExclusiveProducts = async (req, res) => {
    try {
        const { source_country_id, destination_country_id } = req.user;

        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;

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
        const limit = pageSize * 10; // Page size multiplier

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
            take: limit,
            skip: (page - 1) * pageSize
        });

        const formattedProducts = await Promise.all(exclusiveProducts.map(async (product) => {
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

        const clippedFormattedProducts = formattedProducts.slice(0, pageSize)

        return res.json({
            currentPage: page,
            totalPages: totalPages,
            pageSize,
            totalItems: clippedFormattedProducts.length,
            exclusive_products: clippedFormattedProducts
        });

    } catch (err) {
        console.error("Error in getCountryExclusiveProducts:", err);
        res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};
