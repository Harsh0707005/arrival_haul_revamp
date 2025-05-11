const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.updateUserDetails = async (req, res) => {
    try {
        const { firstName, lastName, categoryIds, sourceCountryId, destinationCountryId } = req.body;
        const userId = req.user.id;

        if (!firstName && !lastName && !categoryIds && !sourceCountryId && !destinationCountryId) {
            return res.status(400).json({
                success: false,
                message: "At least one field must be provided for update"
            });
        }

        const updateData = {
            ...(firstName && { firstName }),
            ...(lastName && { lastName }),
            ...(sourceCountryId && { source_country_id: sourceCountryId }),
            ...(destinationCountryId && { destination_country_id: destinationCountryId }),
            ...(Array.isArray(categoryIds) && categoryIds.length > 0 && {
                interestedCategories: {
                    set: categoryIds.map(id => ({ id }))
                }
            })
        };

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                source_country_id: true,
                destination_country_id: true,
                interestedCategories: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        return res.json({
            success: true,
            message: "User details updated successfully",
            user: updatedUser
        });

    } catch (err) {
        console.error("Error in updateUserDetails:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
