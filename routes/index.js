const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const { getPopularHaul } = require("../controllers/popularHaulController");
const { getProductDetails } = require("../controllers/productDetailsController");

router.get("/popular-haul", authMiddleware, getPopularHaul);
router.get('/product-details', getProductDetails);

module.exports = router;
