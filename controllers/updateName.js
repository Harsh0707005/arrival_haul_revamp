const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.updateUserName = async (req, res) => {
    try {
        const { firstName, lastName } = req.body;
        const userId = req.user.id;

        if (!firstName && !lastName) {
            return res.status(400).json({
                success: false,
                message: "At least one of firstName or lastName must be provided"
            });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                ...(firstName && { firstName }),
                ...(lastName && { lastName })
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
            }
        });

        return res.json({
            success: true,
            message: "User name updated successfully",
            user: updatedUser
        });

    } catch (err) {
        console.error("Error in updateUserName:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
