const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const bcrypt = require("bcrypt");

exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Email, OTP, and new password are required"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long"
            });
        }

        const otpRecord = await prisma.otp.findUnique({
            where: { email }
        });

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "No OTP found for this email"
            });
        }
        console.log(otp, otpRecord.otp)

        if (otp !== otpRecord.otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP"
            });
        }

        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { email },
            data: { password: hashedPassword }
        });

        await prisma.otp.delete({
            where: { email }
        });

        const updatedUser = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                mobile: true,
                source_country_id: true,
                destination_country_id: true
            }
        });

        return res.json({
            success: true,
            message: "Password reset successful",
            user: updatedUser
        });

    } catch (error) {
        console.error("Error in resetPassword:", error);
        res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
}; 