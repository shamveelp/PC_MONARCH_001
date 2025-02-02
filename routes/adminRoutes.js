const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController')
const {userAuth,adminAuth} = require('../middlewares/auth');
const multer = require("multer");
const storage = require("../helpers/multer");
const uploads = multer({storage:storage});
const upload = require("../helpers/multer");





router.get('/pageerror', adminController.pageError);
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/',adminAuth,adminController.loadDashboard);

router.get('/logout', adminController.logout);

router.get('/users',adminAuth,customerController.customerInfo);

router.get('/blockCustomer',adminAuth,customerController.customerBlocked);
router.get('/unBlockCustomer',adminAuth,customerController.customerUnblocked);

router.get('/category',adminAuth,categoryController.categoryInfo)
router.post('/addCategory',adminAuth,categoryController.addCategory)

router.post('/addCategoryOffer',adminAuth,categoryController.addCategoryOffer)
router.post('/removeCategoryOffer',adminAuth,categoryController.removeCategoryOffer)

router.get('/listCategory',adminAuth,categoryController.getListCategory)
router.get('/unListCategory',adminAuth,categoryController.getUnlistCategory)

router.get('/editCategory',adminAuth,categoryController.getEditCategory)
router.post('/editCategory/:id',adminAuth,categoryController.editCategory)



router.get("/addProducts", adminAuth, productController.getProductAddPage)
router.post("/addProducts", adminAuth, upload.array("images", 4), productController.addProducts)

module.exports = router;