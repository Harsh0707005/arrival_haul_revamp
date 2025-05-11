const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const generateOtp = require("../services/generateOTP");
const sendEmail = require("../services/sendEmail");
const { signupUser } = require("./authController");

exports.validateSignup = async (req, res) => {
    try {
        const { email, otp, firstName, lastName, mobile, password, countryCode } = req.body;

        if (!email || !otp || !firstName || !lastName || !mobile || !password || !countryCode) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        const otpRecord = await prisma.otp.findUnique({
            where: { email },
        });

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "No OTP found for this email"
            });
        }

        if (otp !== otpRecord.otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP"
            });
        }

        const signupResult = await signupUser({
            firstName,
            lastName,
            email,
            mobile,
            password,
            countryCode
        });

        if (!signupResult.success) {
            return res.status(400).json(signupResult);
        }

        await prisma.otp.delete({
            where: { email }
        });

        return res.json({
            success: true,
            message: "User registered successfully",
            user: signupResult.user
        });

    } catch (error) {
        console.error("Error in validateSignup:", error);
        res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};
