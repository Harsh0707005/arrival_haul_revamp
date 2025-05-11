const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.deleteUser = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        await prisma.user.delete({
            where: { email }
        });

        return res.json({
            success: true,
            message: "User deleted successfully"
        });

    } catch (error) {
        console.error("Error in deleteUserByEmail:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};
