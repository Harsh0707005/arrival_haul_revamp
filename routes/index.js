const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const { getPopularHaul } = require("../controllers/popularHaulController");

router.get("/popular-haul", authMiddleware, getPopularHaul);

module.exports = router;
