require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { calculatePriceDifference } = require("../services/currencyConversion");

exports.getWishlistProducts = async (req, res) => {
    try {
        const userId = req.user.id;
        const { source_country_id, destination_country_id } = req.user;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;

        const totalItems = await prisma.wishlist.count({
            where: { userId }
        });

        const totalPages = Math.ceil(totalItems / pageSize);

        const wishlistEntries = await prisma.wishlist.findMany({
            where: { userId },
            include: {
                product: {
                    include: { brand: true, country: true }
                }
            },
            skip: (page - 1) * pageSize,
            take: pageSize
        });

        if (!wishlistEntries.length) {
            return res.json({
                success: true,
                currentPage: page,
                totalPages,
                pageSize,
                totalItems: 0,
                wishlist_products: []
            });
        }

        const wishlistProducts = await Promise.all(
            wishlistEntries.map(async ({ product }) => {
                const counterpart =
                    product.country_id === source_country_id
                        ? await prisma.product.findFirst({
                            where: {
                                sku_id: product.sku_id,
                                country_id: destination_country_id
                            }
                        })
                        : await prisma.product.findFirst({
                            where: {
                                sku_id: product.sku_id,
                                country_id: source_country_id
                            }
                        });

                let presence = "common";
                if (!counterpart) {
                    presence =
                        product.country_id === source_country_id ? "source" : "destination";
                }

                let sourceBlock = {};
                let destBlock = {};

                if (presence === "common") {
                    const fromSource =
                        product.country_id === source_country_id ? product : counterpart;
                    const fromDest =
                        product.country_id === destination_country_id
                            ? product
                            : counterpart;

                    const diff = await calculatePriceDifference(
                        source_country_id,
                        destination_country_id,
                        fromSource.price,
                        fromDest.price
                    );
                    const swap = await calculatePriceDifference(
                        destination_country_id,
                        source_country_id,
                        fromDest.price,
                        fromSource.price
                    );

                    sourceBlock = {
                        original: diff.sourcePriceOriginal,
                        converted: diff.destinationPriceConverted,
                        price_difference_percentage: diff.percentageDifference,
                        currency: diff.sourceCurrency
                    };
                    destBlock = {
                        original: diff.destinationPriceOriginal,
                        converted: diff.sourcePriceConverted,
                        price_difference_percentage: swap.percentageDifference,
                        currency: diff.destinationCurrency
                    };
                } else if (presence === "source") {
                    sourceBlock = {
                        original: product.price,
                        converted: null,
                        price_difference_percentage: null,
                        currency: product.country.currencySymbol
                    };
                } else {
                    destBlock = {
                        original: product.price,
                        converted: null,
                        price_difference_percentage: null,
                        currency: product.country.currencySymbol
                    };
                }

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
                    images: product.images?.length ? [product.images[0]] : [],
                    presence,
                    is_favourite: true,
                    source_country_details: sourceBlock,
                    destination_country_details: destBlock
                };
            })
        );

        return res.json({
            success: true,
            currentPage: page,
            totalPages,
            pageSize,
            totalItems,
            wishlist_products: wishlistProducts
        });
    } catch (error) {
        console.error("Error fetching wishlist products:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};
