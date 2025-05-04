const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = async function (req, res, next) {
//   const authHeader = req.headers["authorization"];
//   const token = authHeader && authHeader.split(" ")[1];

//   if (!token) return res.status(401).json({ error: "Access token required" });

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const user = await prisma.user.findUnique({
//       where: { id: decoded.id }
//     });

//     if (!user) return res.status(401).json({ error: "Invalid token" });

//     req.user = user;
//     next();
//   } catch (err) {
//     console.error(err);
//     res.status(403).json({ error: "Invalid or expired token" });
//   }
    const user = await prisma.user.findUnique({
        where: {id: 1}
    });

    req.user = user;
    next();

};
