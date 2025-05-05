const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getUserDetails = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                sourceCountry: true,
                destinationCountry: true,
            },
        });

        return res.json({
            success: true,
            user,
        });
    } catch (error) {
        console.error('Error fetching user details:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};
