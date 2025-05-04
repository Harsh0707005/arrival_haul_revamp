const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const { getPopularHaul } = require("../controllers/popularHaulController");
const { getProductDetails } = require("../controllers/productDetailsController");
const { getCommonBrands } = require("../controllers/brandListController");
const { getCommonCategories } = require("../controllers/categoryListController");
const { login, signup } = require("../controllers/authController");

router.post('/signup', signup);
router.post('/login', login);

router.get("/popular-haul", authMiddleware, getPopularHaul);
router.get('/product-details', authMiddleware, getProductDetails);
router.get('/brands/list', authMiddleware, getCommonBrands);
router.get('/categories/list', authMiddleware, getCommonCategories);

module.exports = router;
