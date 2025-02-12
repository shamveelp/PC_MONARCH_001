const express = require('express');
const router = express.Router();
const passport = require('passport');
const userController = require('../controllers/user/userController');
const profileController = require("../controllers/user/profileController")
const productController = require("../controllers/user/productController")
const cartController = require("../controllers/user/cartController")
const wishlistController = require("../controllers/user/wishlistController")
const checkoutController = require("../controllers/user/checkoutController")

const { userAuth } = require('../middlewares/auth');
const {resetPasswordMiddleware,blockLoggedInUsers, checkBlockedUser,checkLoggedIn} = require("../middlewares/profileAuth")


router.get('/pagenotfound', userController.pageNotFound);


router.get('/signup',checkLoggedIn, userController.loadSignUpPage);

router.post('/signup',checkLoggedIn, userController.signUp);

router.post('/verify-otp', userController.verifyOtp);

router.post('/resend-otp', userController.resendOtp);

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), (req, res) => {
    res.redirect('/');
});

router.get('/login',checkLoggedIn, userController.loadLoginPage);

router.post('/login',checkLoggedIn, userController.login);

router.get('/',checkBlockedUser, userController.loadHomePage);

router.get("/shop",userController.loadShoppingPage);
router.get("/filter",userController.filterProduct);


router.get("/productDetails",productController.productDetails);
router.get('/search', userController.searchProducts);


router.get('/logout', userController.logout);


router.get("/forgot-password",blockLoggedInUsers,profileController.getForgotPassPage)
router.post("/forgot-email-valid",blockLoggedInUsers,profileController.forgotEmailValid)
router.post("/verify-passForgot-otp",blockLoggedInUsers,profileController.verifyForgotPassOtp)
router.get("/reset-password",resetPasswordMiddleware,profileController.getResetPassPage)
router.post("/resend-forgot-otp",blockLoggedInUsers,profileController.resendOtp);
router.post("/reset-password",resetPasswordMiddleware,profileController.postNewPassword);


router.get("/userProfile",userAuth,profileController.userProfile);
router.get("/cart",userAuth,cartController.getCartPage)


// wishlist management

router.get("/wishlist",userAuth,wishlistController.loadWishlist)
router.post("/addToWishlist",userAuth,wishlistController.addToWishlist)
router.get("/removeFromWishList",userAuth,wishlistController.removeProduct)


// Cart Management
router.get("/cart", userAuth, cartController.getCartPage);
router.post("/addToCart", userAuth, cartController.addToCart);
router.post("/changeQuantity", userAuth, cartController.changeQuantity);
router.get("/deleteItem", userAuth, cartController.deleteProduct);


// Checkout Management
router.get("/checkout",userAuth,checkoutController.loadCheckoutPage)



// Profile Management
router.get("/loggedinResetPassword",userAuth,profileController.loadResetPassword)



//Address Management
router.get("/address",userAuth,profileController.loadAddressPage)
router.get("/addAddress",userAuth,profileController.addAddress)
router.post("/addAddress",userAuth,profileController.postAddAddress)
router.get("/editAddress",userAuth,profileController.editAddress);
router.post("/editAddress",userAuth,profileController.postEditAddress)
router.get("/deleteAddress",userAuth,profileController.deleteAddress)


module.exports = router;