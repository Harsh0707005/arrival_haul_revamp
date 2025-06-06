require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const { calculatePriceDifference } = require("../services/currencyConversion");
const prisma = new PrismaClient();

exports.getCategoryCommonProducts = async (req, res) => {
    try {
        const { category_id } = req.query;
        const { source_country_id, destination_country_id } = req.user;

        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;

        if (!category_id) {
            return res.status(400).json({ success: false, message: "Missing category_id in query params" });
        }

        const totalItems = await prisma.product.count({
            where: {
                category_id: parseInt(category_id),
                country_id: source_country_id
            }
        });

        const limit = pageSize * 10;

        const sourceProducts = await prisma.$queryRaw`
            SELECT * FROM "Product"
            WHERE category_id = ${parseInt(category_id)} AND country_id = ${source_country_id}
            ORDER BY RANDOM()
            LIMIT ${limit}
        `;

        if (!sourceProducts.length) {
            return res.status(404).json({
                success: false,
                message: "No products found for the given category in the source country",
                products: []
            });
        }

        const skuIds = sourceProducts.map(p => p.sku_id);

        const destinationProducts = await prisma.product.findMany({
            where: {
                sku_id: { in: skuIds },
                country_id: destination_country_id
            }
        });

        const destinationMap = {};
        destinationProducts.forEach(p => {
            destinationMap[p.sku_id] = p;
        });

        const wishlistEntries = await prisma.wishlist.findMany({
            where: {
                userId: req.user.id,
                productId: {
                    in: sourceProducts.map(p => p.id)
                }
            }
        });

        const wishlistedProductIds = new Set(wishlistEntries.map(entry => entry.productId));

        const results = [];

        for (const sourceProduct of sourceProducts) {
            const destinationProduct = destinationMap[sourceProduct.sku_id];
            if (!destinationProduct) continue;

            const diff = await calculatePriceDifference(
                source_country_id,
                destination_country_id,
                sourceProduct.price,
                destinationProduct.price
            );

            const swap_diff = await calculatePriceDifference(
                destination_country_id,
                source_country_id,
                destinationProduct.price,
                sourceProduct.price
            );

            const brand = await prisma.brand.findUnique({
                where: { id: sourceProduct.brand_id }
            });

            // Check if the product is in user's wishlist
            const isFavorite = await prisma.wishlist.findFirst({
                where: {
                    userId: req.user.id,
                    productId: sourceProduct.id
                }
            });

            results.push({
                product_id: sourceProduct.id,
                sku_id: sourceProduct.sku_id,
                product_name: sourceProduct.name,
                price: sourceProduct.price,
                images: sourceProduct.images,
                currency: sourceProduct.currency,
                is_favourite: !!isFavorite,
                brand_name: brand ? brand.name : "Unknown",
                source_country_details: {
                    product_url: sourceProduct.url || "",
                    original: diff.sourcePriceOriginal,
                    converted: diff.destinationPriceConverted,
                    price_difference_percentage: diff.percentageDifference,
                    currency: diff.sourceCurrency
                },
                destination_country_details: {
                    product_url: destinationProduct.url || "",
                    original: diff.destinationPriceOriginal,
                    converted: diff.sourcePriceConverted,
                    price_difference_percentage: swap_diff.percentageDifference,
                    currency: diff.destinationCurrency
                }
            });
        }

        if (!results.length) {
            return res.status(404).json({
                success: false,
                message: "No common products found between source and destination countries",
                products: []
            });
        }

        const totalPages = Math.ceil(results.length / pageSize);
        const paginatedResults = results.slice((page - 1) * pageSize, page * pageSize);

        return res.json({
            success: true,
            message: "Category common products retrieved successfully",
            currentPage: page,
            totalPages,
            pageSize,
            totalItems: results.length,
            categoryProducts: paginatedResults
        });

    } catch (err) {
        console.error("Error in getCategoryCommonProducts:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
