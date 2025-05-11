const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const generateOtp = require("../services/generateOTP");
const sendEmail = require("../services/sendEmail");

exports.otpGeneration = async (req, res) => {
  try {
    const { email, firstName } = req.body;

    if (!email || !firstName) {
      return res.status(400).json({
        success: false,
        message: "Email and firstName are required",
      });
    }

    const otp = await generateOtp(6);

    await prisma.otp.upsert({
      where: { email },
      update: { otp },
      create: { email, otp },
    });

    await sendEmail({
      to: email,
      subject: "Your OTP Code",
      html: `
        <p>Hi <b>${firstName}</b>,</p>
        <p>Your OTP code is: <b>${otp}</b></p>
        <p>This code is valid for a limited time. Do not share it with anyone.</p>
      `,
    });

    res.json({
      success: true,
      message: "OTP generated and sent to user via email",
    });
  } catch (error) {
    console.error("Error in generateOtp:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
