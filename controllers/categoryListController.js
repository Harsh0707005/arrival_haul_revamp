require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.getCommonCategories = async (req, res) => {
    try {
        const { source_country_id, destination_country_id } = req.user;

        const commonCategoryIds = await prisma.$queryRaw`
            SELECT "Category".id
            FROM "Product"
            JOIN "Category" ON "Product".category_id = "Category".id
            WHERE "Product".country_id IN (${source_country_id}, ${destination_country_id})
            GROUP BY "Category".id
            HAVING COUNT(DISTINCT "Product".country_id) = 2
        `;

        const categoryIds = commonCategoryIds.map(c => c.id);

        const fullCategories = await prisma.category.findMany({
            where: {
                id: { in: categoryIds }
            }
        });


        const formattedCategories = fullCategories.map(category => ({
            category_id: category.id,
            category_name: category.name,
            discount: 0,
            is_negative: false,
            createdAt: category.createdAt,
            updatedAt: category.updatedAt
        }))

        return res.json({
            message: "Categories found in both countries",
            categories: formattedCategories
        });

    } catch (err) {
        console.error("Error in getCommonCategories:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
