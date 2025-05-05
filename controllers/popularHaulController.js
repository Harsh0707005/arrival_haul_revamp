require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { calculatePriceDifference } = require('../services/currencyConversion');

exports.getPopularHaul = async (req, res) => {
    try {
        const { source_country_id, destination_country_id } = req.user;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;

        const totalItems = await prisma.product.count({
            where: { country_id: source_country_id }
        });

        const totalPages = Math.ceil(totalItems / pageSize);

        const limit = pageSize * 10;

        const sourceProducts = await prisma.$queryRaw`
            SELECT * FROM "Product"
            WHERE country_id = ${source_country_id}
            ORDER BY RANDOM()
            LIMIT ${limit}
        `;

        const skuIds = sourceProducts.map(p => p.sku_id);
        if (skuIds.length==0){
            return res.json({
                currentPage: 1,
                totalPages: 0,
                pageSize,
                totalItems: 0,
                popular_haul: []
            });
        }

        var destinationProducts = await prisma.product.findMany({
            where: {
                sku_id: { in: skuIds },
                country_id: destination_country_id
            }
        });

        const matchedSkuSet = new Set(destinationProducts.map(p => p.sku_id));

        var matchedSourceProducts = sourceProducts.filter(p =>
            matchedSkuSet.has(p.sku_id)
        );

        matchedSourceProducts = await Promise.all(matchedSourceProducts.map(async function (product) {
            let destination_price = 0;
            for (let destination_product of destinationProducts) {
                if (destination_product.sku_id == product.sku_id) {
                    destination_price = destination_product.price
                    break;
                }
            }

            let diff = await calculatePriceDifference(source_country_id, destination_country_id, product.price, destination_price)
            let swap_diff = await calculatePriceDifference(destination_country_id, source_country_id, destination_price, product.price)

            const brand = await prisma.brand.findUnique({
                where: { id: product.brand_id }
            });

            const country = await prisma.country.findUnique({
                where: { id: product.country_id }
            });

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
            }
        }))
        matchedSourceProducts = matchedSourceProducts.slice(0, pageSize)
        return res.json({
            currentPage: page,
            totalPages: totalPages,
            pageSize,
            totalItems: matchedSourceProducts.length,
            popular_haul: matchedSourceProducts
        });
    } catch (err) {
        console.error("Error in getPopularHaul:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
