require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const { calculatePriceDifference } = require("../services/currencyConversion");
const prisma = new PrismaClient();

exports.getBrandCommonProducts = async (req, res) => {
    try {
        const { brand_id } = req.query;
        const { source_country_id, destination_country_id } = req.user;

        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;

        if (!brand_id) {
            return res.status(400).json({ success: false, message: "Missing brand_id in query params" });
        }

        const totalItems = await prisma.product.count({
            where: {
                brand_id: parseInt(brand_id),
                country_id: source_country_id
            }
        });

        const limit = pageSize * 10;

        const sourceProducts = await prisma.$queryRaw`
            SELECT * FROM "Product"
            WHERE brand_id = ${parseInt(brand_id)} AND country_id = ${source_country_id}
            ORDER BY RANDOM()
            LIMIT ${limit}
        `;

        if (!sourceProducts.length) {
            return res.status(404).json({
                success: false,
                message: "No products found for the given brand in the source country",
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

            if (diff.percentageDifference < -35 || diff.percentageDifference > 35) continue;

            const brand = await prisma.brand.findUnique({
                where: { id: sourceProduct.brand_id }
            });

            results.push({
                product_id: sourceProduct.id,
                sku_id: sourceProduct.sku_id,
                product_name: sourceProduct.name,
                images: [sourceProduct.images[0]],
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

        const totalPages = Math.ceil(results.length / pageSize);

        const paginatedResults = results.slice((page - 1) * pageSize, page * pageSize);

        return res.json({
            success: true,
            message: "Brand common products retrieved successfully",
            currentPage: page,
            totalPages: totalPages,
            pageSize,
            totalItems: results.length,
            brandProducts: paginatedResults
        });

    } catch (err) {
        console.error("Error in getBrandCommonProducts:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
