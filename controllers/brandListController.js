require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const { calculatePriceDifference } = require("../services/currencyConversion");
const prisma = new PrismaClient();

exports.getCommonBrands = async (req, res) => {
    try {
        const { source_country_id, destination_country_id } = req.user;

        const commonBrandIds = await prisma.$queryRaw`
            SELECT "Brand".id
            FROM "Product"
            JOIN "Brand" ON "Product".brand_id = "Brand".id
            WHERE "Product".country_id IN (${source_country_id}, ${destination_country_id})
            GROUP BY "Brand".id
            HAVING COUNT(DISTINCT "Product".country_id) = 2
        `;

        const brandIds = commonBrandIds.map(b => b.id);

        const fullBrands = await prisma.brand.findMany({
            where: {
                id: { in: brandIds }
            }
        });

        const formattedBrands = [];

        for (const brand of fullBrands) {
            const sourceProducts = await prisma.product.findMany({
                where: {
                    country_id: source_country_id,
                    brand_id: brand.id
                },
                select: {
                    sku_id: true,
                    price: true
                }
            });

            const destinationProducts = await prisma.product.findMany({
                where: {
                    country_id: destination_country_id,
                    brand_id: brand.id
                },
                select: {
                    sku_id: true,
                    price: true
                }
            });

            const sourceProductMap = new Map();
            sourceProducts.forEach(p => {
                if (!sourceProductMap.has(p.sku_id)) {
                    sourceProductMap.set(p.sku_id, p.price);
                }
            });

            const destinationProductMap = new Map();
            destinationProducts.forEach(p => {
                if (!destinationProductMap.has(p.sku_id)) {
                    destinationProductMap.set(p.sku_id, p.price);
                }
            });

            const commonSkus = new Set(
                [...sourceProductMap.keys()].filter(sku => destinationProductMap.has(sku))
            );

            let sourceTotal = 0;
            let destinationTotal = 0;

            for (const sku of commonSkus) {
                const sourcePrice = sourceProductMap.get(sku);
                const destinationPrice = destinationProductMap.get(sku);

                const priceDiff = Math.abs(sourcePrice - destinationPrice);
                const percentageDiff = priceDiff / Math.max(sourcePrice, destinationPrice);

                if (percentageDiff < 0.9) {
                    sourceTotal += sourcePrice;
                    destinationTotal += destinationPrice;
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

            formattedBrands.push({
                brand_id: brand.id,
                brand_name: brand.name,
                image: brand.image,
                discount: discount,
                is_negative: false,
                createdAt: brand.createdAt,
                updatedAt: brand.updatedAt
            });
        }

        return res.json({
            message: "Brands found in both countries",
            success: true,
            brands: formattedBrands
        });

    } catch (err) {
        console.error("Error in getCommonBrands:", err);
        res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};
