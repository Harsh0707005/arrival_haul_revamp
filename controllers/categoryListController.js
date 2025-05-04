const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.getCommonCategories = async (req, res) => {
    try {
        const { source_country_id, destination_country_id } = req.user;

        // Get category IDs that have products in both countries
        const commonCategoryIds = await prisma.$queryRaw`
            SELECT "Category".id
            FROM "Product"
            JOIN "Category" ON "Product".category_id = "Category".id
            WHERE "Product".country_id IN (${source_country_id}, ${destination_country_id})
            GROUP BY "Category".id
            HAVING COUNT(DISTINCT "Product".country_id) = 2
        `;

        const categoryIds = commonCategoryIds.map(c => c.id);

        // Fetch full details of those categories
        const fullCategories = await prisma.category.findMany({
            where: {
                id: { in: categoryIds }
            }
        });

        return res.json({
            message: "Categories found in both countries",
            categories: fullCategories
        });

    } catch (err) {
        console.error("Error in getCommonCategories:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
