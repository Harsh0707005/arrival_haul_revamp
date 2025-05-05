const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getUserDetails = async (req, res) => {
    try {
        const user = req.user;

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
