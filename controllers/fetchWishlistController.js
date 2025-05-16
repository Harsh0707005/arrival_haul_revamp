require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { calculatePriceDifference } = require("../services/currencyConversion");

exports.getWishlistProducts = async (req, res) => {
    try {
        const userId = req.user.id;
        const { source_country_id, destination_country_id } = req.user;

        const wishlistEntries = await prisma.wishlist.findMany({
            where: { userId },
            include: {
                product: {
                    include: { brand: true, country: true }
                }
            }
        });

        if (!wishlistEntries.length) {
            return res.json({
                success: true,
                message: "Wishlist is empty",
                wishlistProducts: []
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
                    brand: product.brand?.name || "Unknown",
                    country_name: product.country?.name || "Unknown",
                    images: product.images?.length ? [product.images[0]] : [],
                    presence,
                    source_country_details: sourceBlock,
                    destination_country_details: destBlock
                };
            })
        );

        return res.json({
            success: true,
            message: "Wishlist products fetched successfully",
            wishlistProducts
        });
    } catch (error) {
        console.error("Error fetching wishlist products:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            wishlistProducts: []
        });
    }
};
