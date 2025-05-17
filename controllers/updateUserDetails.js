const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const bcrypt = require("bcrypt");

exports.updateUserDetails = async (req, res) => {
    try {
        const { firstName, lastName, categoryIds, sourceCountryId, destinationCountryId, currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (!firstName && !lastName && !categoryIds && !sourceCountryId && !destinationCountryId && !newPassword) {
            return res.status(400).json({
                success: false,
                message: "At least one field must be provided for update"
            });
        }

        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({
                    success: false,
                    message: "Current password is required to set new password"
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: "New password must be at least 6 characters long"
                });
            }

            const user = await prisma.user.findUnique({
                where: { id: userId }
            });

            const validPassword = await bcrypt.compare(currentPassword, user.password);
            if (!validPassword) {
                return res.status(400).json({
                    success: false,
                    message: "Current password is incorrect"
                });
            }
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

        // Add hashed password to update data if new password is provided
        if (newPassword) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            updateData.password = hashedPassword;
        }

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
