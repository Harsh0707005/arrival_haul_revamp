require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { calculatePriceDifference } = require('../services/currencyConversion');

exports.getCountryExclusiveProducts = async (req, res) => {
    try {
        const { source_country_id, destination_country_id } = req.user;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;

        const totalItems = await prisma.$queryRaw`
            SELECT COUNT(*)::int as count
            FROM "Product" p1
            WHERE p1.country_id = ${source_country_id}
            AND NOT EXISTS (
                SELECT 1 FROM "Product" p2
                WHERE p2.country_id = ${destination_country_id}
                AND p2.sku_id = p1.sku_id
            )
        `;

        const totalPages = Math.ceil(totalItems[0].count / pageSize);

        const exclusiveProducts = await prisma.$queryRaw`
            SELECT 
                p1.id::int as id,
                p1.sku_id,
                p1.name,
                p1.description,
                p1.price::float as price,
                p1.images,
                b.name as brand_name,
                b.id::int as brand_id,
                c.name as category_name,
                c.id::int as category_id
            FROM "Product" p1
            LEFT JOIN "Brand" b ON p1.brand_id = b.id
            LEFT JOIN "Category" c ON p1.category_id = c.id
            WHERE p1.country_id = ${source_country_id}
            AND NOT EXISTS (
                SELECT 1 FROM "Product" p2
                WHERE p2.country_id = ${destination_country_id}
                AND p2.sku_id = p1.sku_id
            )
            ORDER BY RANDOM()
            LIMIT ${pageSize}
            OFFSET ${(page - 1) * pageSize}
        `;

        const formattedProducts = await Promise.all(exclusiveProducts.map(async (product) => {
            const diff = await calculatePriceDifference(
                source_country_id,
                destination_country_id,
                product.price,
                0
            );

            // Check if the product is in user's wishlist
            const isFavorite = await prisma.wishlist.findFirst({
                where: {
                    userId: req.user.id,
                    productId: product.id
                }
            });

            return {
                product_id: product.id,
                sku_id: product.sku_id,
                product_name: product.name,
                product_description: product.description,
                brand: {
                    brand_id: product.brand_id || null,
                    brand_name: product.brand_name || null
                },
                category: {
                    category_id: product.category_id || null,
                    category_name: product.category_name || null
                },
                images: product.images?.length ? [product.images[0]] : [],
                is_favourite: !!isFavorite,
                source_country_details: {
                    original: diff.sourcePriceOriginal,
                    converted: diff.destinationPriceConverted,
                    price_difference_percentage: diff.percentageDifference,
                    currency: diff.sourceCurrency
                },
                destination_country_details: {
                    original: 0,
                    converted: 0,
                    price_difference_percentage: 0,
                    currency: diff.destinationCurrency
                }
            };
        }));

        return res.json({
            success: true,
            currentPage: page,
            totalPages,
            pageSize,
            totalItems: totalItems[0].count,
            exclusive_products: formattedProducts
        });

    } catch (err) {
        console.error("Error in getCountryExclusiveProducts:", err);
        res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};
