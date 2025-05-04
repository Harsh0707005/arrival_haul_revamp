const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.getPopularHaul = async (req, res) => {
  try {
    const { source_country_id, destination_country_id } = req.user;

    const sourceProducts = await prisma.product.findMany({
      where: { country_id: source_country_id },
      take: 10,
      orderBy: { id: "desc" } // Replace with random() SQL if truly random needed
    });

    const skuIds = sourceProducts.map(p => p.sku_id);

    const destinationProducts = await prisma.product.findMany({
      where: {
        sku_id: { in: skuIds },
        country_id: destination_country_id
      }
    });

    const matchedSkuSet = new Set(destinationProducts.map(p => p.sku_id));

    const matchedSourceProducts = sourceProducts.filter(p =>
      matchedSkuSet.has(p.sku_id)
    );

    return res.json({
      matched_products: matchedSourceProducts
    });
  } catch (err) {
    console.error("Error in getPopularHaul:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
