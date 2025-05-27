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
        const filter = req.query.filter || 'common';

        const wishlistEntries = await prisma.wishlist.findMany({
            where: { userId },
            include: {
                product: {
                    include: { 
                        brand: true, 
                        country: true,
                        category: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        let resultProducts = [];
        
        for (const entry of wishlistEntries) {
            const product = entry.product;
            
            const destProduct = await prisma.product.findFirst({
                where: {
                    sku_id: product.sku_id,
                    country_id: destination_country_id
                },
                include: {
                    brand: true,
                    country: true,
                    category: true
                }
            });

            const sourceProduct = await prisma.product.findFirst({
                where: {
                    sku_id: product.sku_id,
                    country_id: source_country_id
                },
                include: {
                    brand: true,
                    country: true,
                    category: true
                }
            });

            switch (filter) {
                case 'common':
                    if (sourceProduct && destProduct) {
                        resultProducts.push({ sourceProduct, destProduct });
                    }
                    break;

                case 'source':
                    if (sourceProduct && !destProduct) {
                        resultProducts.push({ sourceProduct });
                    }
                    break;

                case 'destination':
                    if (!sourceProduct && destProduct) {
                        resultProducts.push({ destProduct });
                    }
                    break;

                case 'others':
                    if (!sourceProduct && !destProduct) {
                        resultProducts.push({ product });
                    }
                    break;
            }
        }

        const totalItems = resultProducts.length;
        const totalPages = Math.ceil(totalItems / pageSize);
        const startIndex = (page - 1) * pageSize;
        const paginatedProducts = resultProducts.slice(startIndex, startIndex + pageSize);

        if (!paginatedProducts.length) {
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
            paginatedProducts.map(async (entry) => {
                const { sourceProduct, destProduct, product } = entry;
                let presence;
                let sourceBlock = {
                    original: null,
                    converted: null,
                    price_difference_percentage: null,
                    currency: null
                };
                let destBlock = {
                    original: null,
                    converted: null,
                    price_difference_percentage: null,
                    currency: null
                };

                if (filter === 'common') {
                    presence = 'common';
                    const diff = await calculatePriceDifference(
                        source_country_id,
                        destination_country_id,
                        sourceProduct.price,
                        destProduct.price
                    );

                    const swap = await calculatePriceDifference(
                        destination_country_id,
                        source_country_id,
                        destProduct.price,
                        sourceProduct.price
                    );

                    sourceBlock = {
                        original: sourceProduct.price,
                        converted: diff.destinationPriceConverted,
                        price_difference_percentage: diff.percentageDifference,
                        currency: sourceProduct.country.currencySymbol
                    };

                    destBlock = {
                        original: destProduct.price,
                        converted: diff.sourcePriceConverted,
                        price_difference_percentage: swap.percentageDifference,
                        currency: destProduct.country.currencySymbol
                    };
                } else if (filter === 'source') {
                    presence = 'source';
                    sourceBlock = {
                        original: sourceProduct.price,
                        converted: null,
                        price_difference_percentage: null,
                        currency: sourceProduct.country.currencySymbol
                    };
                } else if (filter === 'destination') {
                    presence = 'destination';
                    destBlock = {
                        original: destProduct.price,
                        converted: null,
                        price_difference_percentage: null,
                        currency: destProduct.country.currencySymbol
                    };
                } else {
                    presence = 'others';
                    if (product.country_id === source_country_id) {
                        sourceBlock = {
                            original: product.price,
                            converted: null,
                            price_difference_percentage: null,
                            currency: product.country.currencySymbol
                        };
                    } else if (product.country_id === destination_country_id) {
                        destBlock = {
                            original: product.price,
                            converted: null,
                            price_difference_percentage: null,
                            currency: product.country.currencySymbol
                        };
                    }
                }

                const baseProduct = sourceProduct || destProduct || product;
                return {
                    product_id: baseProduct.id,
                    sku_id: baseProduct.sku_id,
                    product_name: baseProduct.name,
                    product_description: baseProduct.description,
                    brand: {
                        brand_id: baseProduct.brand?.id || null,
                        brand_name: baseProduct.brand?.name || null
                    },
                    category: {
                        category_id: baseProduct.category?.id || null,
                        category_name: baseProduct.category?.name || null
                    },
                    images: baseProduct.images?.length ? [baseProduct.images[0]] : [],
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
