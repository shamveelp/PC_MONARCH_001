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
const staticController = require("../controllers/user/staticController")
const commentController = require("../controllers/user/commentController")
const multer = require("multer")
const upload = require('../config/multer');

const { userAuth,addCartWishlist,checkUserAuthWish,ajaxAuth } = require('../middlewares/auth');
const {resetPasswordMiddleware,blockLoggedInUsers, checkBlockedUser,checkLoggedIn,forgotPassLogout} = require("../middlewares/profileAuth")


router.get('/pagenotfound', userController.pageNotFound);


router.get('/signup',checkLoggedIn, userController.loadSignUpPage);

router.post('/signup',checkLoggedIn, userController.signUp);

router.post('/verify-otp', userController.verifyOtp);

router.post('/resend-otp', userController.resendOtp);

// router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), (req, res) => {
//     res.redirect('/');
// });


router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), async (req, res) => {
    try {
        req.session.user = req.user._id;
        res.redirect('/');
    } catch (error) {
        console.log("Google login error:", error);
        res.redirect('/signup');
    }
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
router.post("/addToWishlist",ajaxAuth,wishlistController.addToWishlist)
router.get("/removeFromWishList",userAuth,wishlistController.removeProduct)


// Cart Management
router.get("/cart", userAuth, cartController.getCartPage);
router.post("/addToCart", ajaxAuth, cartController.addToCart);
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

router.get("/forgot-password-logout",forgotPassLogout,profileController.getForgotPassPage)


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

router.get('/check-stock',userAuth, checkoutController.checkStock);

router.get("/download-invoice", userAuth, orderController.generateInvoice);

// New routes for order cancellation and returns
router.post("/orders/cancel", userAuth, orderController.cancelOrder);
router.post("/orders/return", userAuth, upload.array('images', 3), orderController.requestReturn);
router.post("/orders/cancel-return", userAuth, orderController.cancelReturnRequest);



// Coupons Management
router.get("/mycoupons",userAuth,couponController.loadCoupons)
router.post("/apply-coupon", userAuth, checkoutController.applyCoupon);


// wallet Management
router.get('/wallet',userAuth, walletController.loadWallet);
router.post('/wallet/create-razorpay-order', userAuth, walletController.createRazorpayOrder);
router.post('/wallet/verify-payment', userAuth, walletController.verifyPayment);
router.post('/wallet/withdraw-money', userAuth, walletController.withdrawMoney);
router.post('/place-wallet-order', userAuth, orderController.placeWalletOrder);


// Static Pages
router.get("/contact",staticController.loadContact)
router.get("/about",staticController.loadAbout)





router.post('/api/comments', userAuth, commentController.addComment);
router.get('/api/products/:productId/comments', commentController.getProductComments);
router.delete('/api/comments/:commentId', userAuth, commentController.deleteComment);

// router.use((req, res) => {
//     res.status(404).redirect("/pageNotFound");
// });

module.exports = router;