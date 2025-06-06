require('dotenv').config();
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const { getPopularHaul } = require("../controllers/popularHaulController");
const { getProductDetails } = require("../controllers/productDetailsController");
const { getCommonBrands } = require("../controllers/brandListController");
const { getCommonCategories } = require("../controllers/categoryListController");
const { login, signup } = require("../controllers/authController");
const { updateUserCountries } = require("../controllers/updateCountryController");
const { getUserDetails } = require('../controllers/userDetailsController');
const { getCountries } = require('../controllers/countryListController');
const { getCountryExclusiveProducts } = require('../controllers/countryExclusive');
const { getRecommendedProducts } = require('../controllers/recommendationController');
const { getBrandCommonProducts } = require('../controllers/brandCommonProducts');
const { getCategoryCommonProducts } = require('../controllers/categoryCommonProducts');
const { updateUserDetails } = require('../controllers/updateUserDetails');
const { getUserWithCategories } = require('../controllers/fetchInterestedCategories');
const { otpGeneration } = require('../controllers/otpController');
const { validateSignup } = require('../controllers/validateOTPAndSignup');
const { deleteUser } = require('../controllers/deleteUser');
const { toggleWishlist } = require('../controllers/toggleWishlistController');
const { getWishlistProducts } = require('../controllers/fetchWishlistController');
const { resetPassword } = require('../controllers/resetPasswordController');
const { searchProducts } = require('../controllers/searchProductsController');
const { getDailyDiscoveries } = require("../controllers/dailyDiscoveriesController");
const { submitProductFeedback } = require("../controllers/productFeedbackController");

// router.post('/signup', signup);
router.post('/login', login);
router.get('/user-details', authMiddleware, getUserDetails);
router.put('/user/update', authMiddleware, updateUserDetails);
router.get('/user/interested-categories', authMiddleware, getUserWithCategories);

router.post('/wishlist', authMiddleware, toggleWishlist);
router.get('/wishlist-list', authMiddleware, getWishlistProducts)

router.delete('/user/delete', deleteUser)

router.post("/user/generate-otp", otpGeneration);
router.post("/user/validation-signup", validateSignup);
router.post("/user/reset-password", resetPassword);
router.get("/search", authMiddleware, searchProducts);

router.get("/country-exclusives", authMiddleware, getCountryExclusiveProducts)

router.get("/brand-products", authMiddleware, getBrandCommonProducts)
router.get("/category-products", authMiddleware, getCategoryCommonProducts)

router.get('/country-list', authMiddleware, getCountries);
router.post('/update-countries', authMiddleware, updateUserCountries);

router.get("/recommended-products", authMiddleware, getRecommendedProducts)
router.get("/popular-haul", authMiddleware, getPopularHaul);
router.get('/product-details', authMiddleware, getProductDetails);
router.get('/brands/list', authMiddleware, getCommonBrands);
router.get('/categories/list', authMiddleware, getCommonCategories);
router.get("/daily-discoveries", authMiddleware, getDailyDiscoveries);

router.post("/product-feedback", authMiddleware, submitProductFeedback);

module.exports = router;
