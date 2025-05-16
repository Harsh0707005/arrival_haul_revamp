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
          include: {
            brand: true,
            country: true,
          }
        }
      }
    });

    if (wishlistEntries.length === 0) {
      return res.json({ success: true, message: "Wishlist is empty", wishlistProducts: [] });
    }

    const wishlistProducts = await Promise.all(wishlistEntries.map(async (entry) => {
      const product = entry.product;

      const destinationProduct = await prisma.product.findFirst({
        where: {
          sku_id: product.sku_id,
          country_id: destination_country_id
        }
      });

      if (!destinationProduct) return null;

      const diff = await calculatePriceDifference(
        source_country_id,
        destination_country_id,
        product.price,
        destinationProduct.price
      );

      const swap_diff = await calculatePriceDifference(
        destination_country_id,
        source_country_id,
        destinationProduct.price,
        product.price
      );

      return {
        product_id: product.id,
        sku_id: product.sku_id,
        product_name: product.name,
        product_description: product.description,
        brand: product.brand?.name || "Unknown",
        country_name: product.country?.name || "Unknown",
        images: product.images.length > 0 ? [product.images[0]] : [],
        source_country_details: {
          original: diff.sourcePriceOriginal,
          converted: diff.destinationPriceConverted,
          price_difference_percentage: diff.percentageDifference,
          currency: diff.sourceCurrency,
        },
        destination_country_details: {
          original: diff.destinationPriceOriginal,
          converted: diff.sourcePriceConverted,
          price_difference_percentage: swap_diff.percentageDifference,
          currency: diff.destinationCurrency,
        },
      };
    }));

    return res.json({
      success: true,
      message: "Wishlist products fetched successfully",
      wishlistProducts: wishlistProducts.filter(Boolean),
    });
  } catch (error) {
    console.error("Error fetching wishlist products:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", wishlistProducts: [] });
  }
};
