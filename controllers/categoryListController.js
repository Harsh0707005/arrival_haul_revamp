require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const { calculatePriceDifference } = require("../services/currencyConversion");
const prisma = new PrismaClient();

exports.getCommonCategories = async (req, res) => {
    try {
        const { source_country_id, destination_country_id } = req.user;

        const commonCategoryIds = await prisma.$queryRaw`
            SELECT "Category".id
            FROM "Product"
            JOIN "Category" ON "Product".category_id = "Category".id
            WHERE "Product".country_id IN (${source_country_id}, ${destination_country_id})
            GROUP BY "Category".id
            HAVING COUNT(DISTINCT "Product".country_id) = 2
        `;

        const categoryIds = commonCategoryIds.map(c => c.id);

        const fullCategories = await prisma.category.findMany({
            where: {
                id: { in: categoryIds }
            }
        });

        const formattedCategories = [];

        for (const category of fullCategories) {
            const sourceProducts = await prisma.product.findMany({
                where: {
                    country_id: source_country_id,
                    category_id: category.id
                },
                select: {
                    sku_id: true,
                    price: true
                }
            });

            const destinationProducts = await prisma.product.findMany({
                where: {
                    country_id: destination_country_id,
                    category_id: category.id
                },
                select: {
                    sku_id: true,
                    price: true
                }
            });

            const destinationProductMap = new Map();
            destinationProducts.forEach(p => destinationProductMap.set(p.sku_id, p.price));

            let sourceTotal = 0;
            let destinationTotal = 0;

            for (const sp of sourceProducts) {
                if (destinationProductMap.has(sp.sku_id)) {
                    sourceTotal += sp.price;
                    destinationTotal += destinationProductMap.get(sp.sku_id);
                }
            }

            let discount = 0;
            if (sourceTotal > 0 && destinationTotal > 0) {
                const diff = await calculatePriceDifference(
                    source_country_id,
                    destination_country_id,
                    sourceTotal,
                    destinationTotal
                );
                discount = diff.percentageDifference;
            }

            formattedCategories.push({
                category_id: category.id,
                category_name: category.name,
                discount: discount,
                is_negative: false,
                createdAt: category.createdAt,
                updatedAt: category.updatedAt
            });
        }

        return res.json({
            message: "Categories found in both countries",
            success: true,
            categories: formattedCategories
        });

    } catch (err) {
        console.error("Error in getCommonCategories:", err);
        res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};
