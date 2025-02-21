const express = require('express');
const router = express.Router();
const passport = require('passport');
const userController = require('../controllers/user/userController');
const profileController = require("../controllers/user/profileController")
const productController = require("../controllers/user/productController")
const cartController = require("../controllers/user/cartController")
const wishlistController = require("../controllers/user/wishlistController")
const checkoutController = require("../controllers/user/checkoutController")
const orderController = require("../controllers/user/orderController")
const couponController = require("../controllers/user/couponController")
const walletController = require("../controllers/user/walletController")
const multer = require("multer")
const upload = multer({ storage: multer.memoryStorage() })

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
router.get("/addAddressCheckout",userAuth,checkoutController.addAddressCheckout)
router.post("/addAddressCheckout",userAuth,checkoutController.postAddAddressCheckout)




// Profile Management
router.post("/update-profile",userAuth,profileController.updateProfile)
router.get("/change-email",userAuth,profileController.changeEmail)
router.post("/change-email",userAuth,profileController.changeEmailValid)
router.post("/verify-email-otp",userAuth,profileController.verifyEmailOtp)
router.post("/update-email",userAuth,profileController.updateEmail)

router.post("/change-password", userAuth, profileController.changePassword)


//Address Management
router.get("/address",userAuth,profileController.loadAddressPage)
router.get("/addAddress",userAuth,profileController.addAddress)
router.post("/addAddress",userAuth,profileController.postAddAddress)
router.get("/editAddress",userAuth,profileController.editAddress);
router.post("/editAddress",userAuth,profileController.postEditAddress)
router.get("/deleteAddress",userAuth,profileController.deleteAddress)


// Order Management
router.post("/placeOrder", userAuth, orderController.placeOrder);
router.get("/orders", userAuth, orderController.getOrders);
router.get("/order-details", userAuth, orderController.loadOrderDetails);

router.post('/create-razorpay-order', userAuth, orderController.createRazorpayOrder);
router.post('/verify-payment', userAuth, orderController.verifyPayment);

// New routes for order cancellation and returns
router.post("/orders/cancel", userAuth, orderController.cancelOrder);



// Coupons Management
router.get("/mycoupons",userAuth,couponController.loadCoupons)
router.post("/apply-coupon", userAuth, checkoutController.applyCoupon);


// wallet Management
router.get("/wallet",userAuth,walletController.loadWallet)


module.exports = router;