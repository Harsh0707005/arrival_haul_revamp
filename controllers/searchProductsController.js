const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { calculatePriceDifference } = require("../services/currencyConversion");

exports.searchProducts = async (req, res) => {
    try {
        const { query } = req.query;
        const { source_country_id, destination_country_id } = req.user;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;

        if (!query) {
            return res.status(400).json({
                success: false,
                message: "Search query is required"
            });
        }

        const totalItems = await prisma.product.count({
            where: {
                AND: [
                    {
                        OR: [
                            { name: { contains: query, mode: 'insensitive' } },
                            { description: { contains: query, mode: 'insensitive' } }
                        ]
                    },
                    { country_id: source_country_id }
                ]
            }
        });

        const totalPages = Math.ceil(totalItems / pageSize);

        const products = await prisma.product.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { name: { contains: query, mode: 'insensitive' } },
                            { description: { contains: query, mode: 'insensitive' } }
                        ]
                    },
                    { country_id: source_country_id }
                ]
            },
            include: {
                brand: true,
                category: true,
                country: true
            },
            skip: (page - 1) * pageSize,
            take: pageSize
        });

        if (!products.length) {
            return res.json({
                currentPage: page,
                totalPages,
                pageSize,
                totalItems: 0,
                search_results: []
            });
        }
        
        const skuIds = products.map(p => p.sku_id);
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

        const formattedProducts = await Promise.all(products.map(async (product) => {
            const destinationProduct = destinationMap[product.sku_id];
            
            const diff = await calculatePriceDifference(
                source_country_id,
                destination_country_id,
                product.price,
                destinationProduct?.price ?? 0
            );

            const swap_diff = await calculatePriceDifference(
                destination_country_id,
                source_country_id,
                destinationProduct?.price ?? 0,
                product.price
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
                brand: product.brand ? product.brand.name : "Unknown",
                country_name: product.country ? product.country.name : "Unknown",
                images: product.images?.length ? [product.images[0]] : [],
                is_favourite: !!isFavorite,
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

        return res.json({
            currentPage: page,
            totalPages,
            pageSize,
            totalItems,
            search_results: formattedProducts
        });

    } catch (error) {
        console.error("Error in searchProducts:", error);
        res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
}; 