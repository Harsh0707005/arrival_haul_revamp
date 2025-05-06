const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const mapCountry = (country) => ({
    country_id: country.id,
    country_name: country.name,
    currency: country.currency,
    currency_symbol: country.currencySymbol,
    country_code: country.code,
    mobile_code: country.mobileCode,
});

exports.getCountries = async (req, res) => {
    try {
        const countries = await prisma.country.findMany();

        const mappedCountries = countries.map(mapCountry);

        return res.json({
            message: 'Country list retrieved successfully',
            success: true,
            countries: mappedCountries
        });
    } catch (err) {
        console.error("Error fetching countries:", err);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};
