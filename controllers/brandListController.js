require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
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

        const formattedBrands = fullBrands.map(brand => ({
            brand_id: brand.id,
            brand_name: brand.name,
            image: brand.image,
            discount: 0,
            is_negative: false,
            createdAt: brand.createdAt,
            updatedAt: brand.updatedAt
        }))

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
