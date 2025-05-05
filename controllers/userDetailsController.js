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

        const mapCountry = (country) => ({
            country_id: country.id,
            country_name: country.name,
            currency: country.currency,
            currency_symbol: country.currencySymbol,
            country_code: country.code,
            mobile_code: country.mobileCode,
        });

        return res.json({
            success: true,
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                mobile: user.mobile,
                sourceCountry: mapCountry(user.sourceCountry),
                destinationCountry: mapCountry(user.destinationCountry),
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            },
        });
    } catch (error) {
        console.error('Error fetching user details:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};
