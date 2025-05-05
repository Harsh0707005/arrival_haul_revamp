require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const { calculatePriceDifference } = require("../services/currencyConversion");
const prisma = new PrismaClient();

const mapCountry = (country) => ({
    country_id: country.id,
    country_name: country.name,
    currency: country.currency,
    currency_symbol: country.currencySymbol,
    country_code: country.code,
    mobile_code: country.mobileCode,
});

exports.getProductDetails = async (req, res) => {
    try {
        const { product_id } = req.query;
        const { source_country_id, destination_country_id } = req.user;

        const source_country = await prisma.country.findUnique({
            where: { id: source_country_id }
        });

        const destination_country = await prisma.country.findUnique({
            where: { id: destination_country_id }
        });

        const product = await prisma.product.findUnique({
            where: { id: parseInt(product_id) },
            include: {
                brand: true,
                country: true,
                category: true
            }
        });

        if (!product) {
            return res.json({ message: "No Product Details found" });
        }

        const destinationProduct = await prisma.product.findFirst({
            where: {
                country_id: destination_country_id,
                sku_id: product.sku_id
            }
        });

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

        const productDetails = {
            product_id: product.id,
            sku_id: product.sku_id,
            product_name: product.name,
            product_description: product.description,
            category_id: product.category_id,
            category_name: product.category?.name || "Unknown",
            price: product.price,
            brand_id: product.brand_id,
            brand_name: product.brand?.name || "Unknown",
            country_name: product.country?.name || "Unknown",
            is_favourite: false,
            images: product.images,
            currency: product.currency,

            source_currency_details: {
                country: mapCountry(source_country),
                original: diff.sourcePriceOriginal,
                converted: diff.destinationPriceConverted,
                price_difference_percentage: diff.percentageDifference,
                currency: diff.sourceCurrency
            },
            destination_currency_details: {
                country: mapCountry(destination_country),
                original: diff.destinationPriceOriginal,
                converted: diff.sourcePriceConverted,
                price_difference_percentage: swap_diff.percentageDifference,
                currency: diff.destinationCurrency
            }
        };

        return res.json({
            message: "Product Data retrieved successfully",
            product: productDetails
        });

    } catch (err) {
        console.error("Error in getProductDetails:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
