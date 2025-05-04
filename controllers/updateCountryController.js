require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.updateUserCountries = async (req, res) => {
    try {
        const userId = req.user.id;
        const { source_country_id, destination_country_id } = req.body;

        if (!source_country_id && !destination_country_id) {
            return res.status(400).json({
                error: 'At least one of source_country_id or destination_country_id must be provided'
            });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                ...(source_country_id && { source_country_id: parseInt(source_country_id) }),
                ...(destination_country_id && { destination_country_id: parseInt(destination_country_id) })
            }
        });

        res.json({
            message: 'User country details updated successfully',
            user: updatedUser
        });

    } catch (err) {
        console.error('Error updating user countries:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
