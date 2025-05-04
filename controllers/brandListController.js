const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.getCommonBrands = async (req, res) => {
    try {
        const { source_country_id, destination_country_id } = req.user;

        // Get brand IDs present in both countries
        const commonBrandIds = await prisma.$queryRaw`
            SELECT "Brand".id
            FROM "Product"
            JOIN "Brand" ON "Product".brand_id = "Brand".id
            WHERE "Product".country_id IN (${source_country_id}, ${destination_country_id})
            GROUP BY "Brand".id
            HAVING COUNT(DISTINCT "Product".country_id) = 2
        `;

        const brandIds = commonBrandIds.map(b => b.id);

        // Fetch full details of those brands
        const fullBrands = await prisma.brand.findMany({
            where: {
                id: { in: brandIds }
            }
        });

        return res.json({
            message: "Brands found in both countries",
            brands: fullBrands
        });

    } catch (err) {
        console.error("Error in getCommonBrands:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
