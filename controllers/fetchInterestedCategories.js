const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.getUserWithCategories = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                interestedCategories: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        return res.json({
            success: true,
            user
        });

    } catch (err) {
        console.error("Error fetching user:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
