require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

exports.signupUser = async function ({ firstName, lastName, email, mobile, password, countryCode = 102 }) {
    try {
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email },
                    { mobile }
                ]
            }
        });

        if (existingUser) {
            return { success: false, message: "User already exists with this email or mobile." };
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "30d" });

        const user = await prisma.user.create({
            data: {
                firstName,
                lastName,
                email,
                mobile,
                password: hashedPassword,
                token,
                countryCode
            }
        });

        return {
            success: true,
            message: "User registered successfully",
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                mobile: user.mobile,
                token: user.token,
                countryCode: user.countryCode
            }
        };

    } catch (error) {
        console.error("Signup error:", error);
        return { success: false, message: "Internal Server Error" };
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid email or password." });
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(400).json({ success: false, message: "Invalid email or password." });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

        await prisma.user.update({
            where: { id: user.id },
            data: { token }
        });

        res.json({
            success: true,
            message: "Login successful",
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                mobile: user.mobile,
                source_country_id: user.source_country_id,
                destination_country_id: user.destination_country_id,
                token
            }
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
