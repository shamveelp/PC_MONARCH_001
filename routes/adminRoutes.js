const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const bannerController = require("../controllers/admin/bannerController");
const orderController = require("../controllers/admin/orderController");
const couponController = require('../controllers/admin/couponController');
const salesController = require('../controllers/admin/salesController');
const commentController = require('../controllers/admin/commentController');
const transactionController = require('../controllers/admin/transactionController');

const { adminAuth } = require('../middlewares/auth');
const multer = require("multer");
const upload = multer();

router.get('/pageerror', adminController.pageError);
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/', adminAuth, adminController.loadDashboard);
router.get('/logout', adminController.logout);

router.get('/users', adminAuth, customerController.customerInfo);
router.get('/blockCustomer', adminAuth, customerController.customerBlocked);
router.get('/unBlockCustomer', adminAuth, customerController.customerUnblocked);

router.get('/category', adminAuth, categoryController.categoryInfo);
router.post('/addCategory', adminAuth, categoryController.addCategory);
router.post('/addCategoryOffer', adminAuth, categoryController.addCategoryOffer);
router.post('/removeCategoryOffer', adminAuth, categoryController.removeCategoryOffer);
router.get('/listCategory', adminAuth, categoryController.getListCategory);
router.get('/unListCategory', adminAuth, categoryController.getUnlistCategory);
router.get('/editCategory', adminAuth, categoryController.getEditCategory);
router.post('/editCategory/:id', adminAuth, categoryController.editCategory);
router.post("/editCategoryOffer", adminAuth, categoryController.editCategoryOffer)
router.delete("/deleteCategory/:id", adminAuth, categoryController.deleteCategory)

router.get("/addProducts", adminAuth, productController.getProductAddPage);
router.post("/saveImage", adminAuth, upload.single('image'), productController.saveImage);
router.post("/addProducts", adminAuth, upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 },
    { name: 'image4', maxCount: 1 }
]), productController.addProducts);


router.get("/products",adminAuth,productController.getAllProducts);
router.post("/addProductOffer",adminAuth,productController.addProductOffer);
router.post("/removeProductOffer",adminAuth,productController.removeProductOffer);

router.get("/blockProduct",adminAuth,productController.blockProduct);
router.get("/unblockProduct",adminAuth,productController.unblockProduct);

router.get("/editProduct",adminAuth,productController.getEditProduct)
router.post("/editProduct/:id", adminAuth, upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 },
    { name: 'image4', maxCount: 1 }
]), productController.editProduct);
router.post("/deleteImage",adminAuth,productController.deleteSingleImage)

router.get('/deleteProduct',adminAuth,productController.deleteProduct);

// Order Management Routes
router.get('/orders', adminAuth, orderController.getOrders);
router.get('/orders/:id', adminAuth, orderController.getOrderDetails);
router.post('/orders/update-status', adminAuth, orderController.updateOrderStatus);
router.post('/orders/handle-return', adminAuth, orderController.handleReturnRequest);
router.post('/orders/update-return-status', adminAuth, orderController.updateReturnStatus);
router.post('/orders/cancel', adminAuth, orderController.cancelOrder);



// Banner Management  
router.get("/banner",adminAuth,bannerController.getBannerPage)



// Coupon Management
router.get("/coupon",adminAuth,couponController.loadCoupon)
router.post("/createCoupon",adminAuth,couponController.createCoupon)
router.get("/editCoupon",adminAuth,couponController.editCoupon)
router.post("/updateCoupon",adminAuth,couponController.updateCoupon)
router.get("/deletecoupon",adminAuth,couponController.deleteCoupon)



// Sales Management
router.get('/sales', adminAuth, salesController.loadSalesPage);
router.get('/sales/report', adminAuth, salesController.loadSalesPage);


// Transaction Management Routes
router.get("/transactions", adminAuth, transactionController.getAllTransactions)
router.get("/transactions/:transactionId", adminAuth, transactionController.getTransactionDetails)
router.post("/transactions/create", adminAuth, transactionController.createManualTransaction)
router.get("/transactions/stats", adminAuth, transactionController.getTransactionStats)




//
router.get("/api/sales-data", adminAuth, adminController.getSalesData)
// router.get("/api/top-products", adminAuth, adminController.getTopProducts)
router.get("/api/top-selling", adminAuth, adminController.getTopSelling)

router.get("/dashboard",adminAuth,async (req,res)=>{
    try {
        res.redirect("/admin")
        
    } catch (error) {
        res.redirect("/admin/pageerror")
        
    }
})


router.get('/comments', adminAuth, commentController.getAllComments);
router.delete('/comments/:commentId', adminAuth, commentController.deleteComment);
router.post('/comments/:commentId/block', adminAuth, commentController.blockComment);
router.post('/comments/:commentId/unblock', adminAuth, commentController.unblockComment);


router.use((req, res) => {
    res.status(404).redirect("/admin/pageerror");
});





module.exports = router;