const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

exports.signup = async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            mobile,
            password,
            source_country_id,
            destination_country_id
        } = req.body;

        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email },
                    { mobile }
                ]
            }
        });

        if (existingUser) {
            return res.status(400).json({ error: "User already exists with this email or mobile." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });

        const user = await prisma.user.create({
            data: {
              firstName,
              lastName,
              email,
              mobile,
              password: hashedPassword,
              token,
              source_country_id,
              destination_country_id
            }
          });
          

        res.status(201).json({
            message: "User registered successfully",
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                mobile: user.mobile,
                source_country_id: user.source_country_id,
                destination_country_id: user.destination_country_id,
                token: user.token
            }
        });

    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return res.status(400).json({ error: "Invalid email or password." });
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(400).json({ error: "Invalid email or password." });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

        await prisma.user.update({
            where: { id: user.id },
            data: { token }
        });

        res.json({
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
        res.status(500).json({ error: "Internal Server Error" });
    }
};
