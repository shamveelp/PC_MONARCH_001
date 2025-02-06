const express = require('express');
const router = express.Router();
const passport = require('passport');
const userController = require('../controllers/user/userController');
const profileController = require("../controllers/user/profileController")
const productController = require("../controllers/user/productController")
const { userAuth } = require('../middlewares/auth');
const {resetPasswordMiddleware,blockLoggedInUsers, checkBlockedUser} = require("../middlewares/profileAuth")


router.get('/pagenotfound', userController.pageNotFound);


router.get('/signup', userController.loadSignUpPage);

router.post('/signup', userController.signUp);

router.post('/verify-otp', userController.verifyOtp);

router.post('/resend-otp', userController.resendOtp);

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), (req, res) => {
    res.redirect('/');
});

router.get('/login', userController.loadLoginPage);

router.post('/login', userController.login);

router.get('/',checkBlockedUser, userController.loadHomePage);

router.get("/shop",blockLoggedInUsers,userController.loadShoppingPage);
router.get("/filter",userAuth,userController.filterProduct);


router.get("/productDetails",blockLoggedInUsers,productController.productDetails)


router.get('/logout', userController.logout);


router.get("/forgot-password",blockLoggedInUsers,profileController.getForgotPassPage)
router.post("/forgot-email-valid",blockLoggedInUsers,profileController.forgotEmailValid)
router.post("/verify-passForgot-otp",blockLoggedInUsers,profileController.verifyForgotPassOtp)
router.get("/reset-password",resetPasswordMiddleware,profileController.getResetPassPage)
router.post("/resend-forgot-otp",blockLoggedInUsers,profileController.resendOtp);
router.post("/reset-password",resetPasswordMiddleware,profileController.postNewPassword);


router.get("/userProfile",userAuth,profileController.userProfile)


module.exports = router;