import logger from '../../utils/logger.js';
import User from "../../models/userSchema.js";
import Wishlist from "../../models/wishlistSchema.js";
import Product from "../../models/productSchema.js";


import STATUS_CODES from '../../enums/statusCodes.js';
import MESSAGES from '../../enums/constants.js';

const loadWishlist = async (req,res) => {
    try {
        
        const userId = req.session.user;
        const user = await User.findById(userId);
        const products = await Product.find({_id:{$in:user.wishlist}}).populate('category');

        res.render("wishlist",{
            user,
            wishlist:products,

        })

        

    } catch (error) {

        logger.error(MESSAGES.ERROR,error)
        res.redirect("/pageNotFound")
        
    }
}

const addToWishlist = async (req, res) => {
    try {
        

        const productId = req.body.productId;
        const userId = req.session.user;

        if (!productId || !userId) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ status: false, message: MESSAGES.INVALID_REQUEST_DATA });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(STATUS_CODES.NOT_FOUND).json({ status: false, message: MESSAGES.USER_NOT_FOUND });
        }

        // Ensure wishlist is an array before modifying
        if (!Array.isArray(user.wishlist)) {
            user.wishlist = [];
        }

        if (user.wishlist.includes(productId)) {
            return res.status(STATUS_CODES.OK).json({ status: false, message: MESSAGES.PRODUCT_ALREADY_IN_WISHLIST });
        }

        user.wishlist.push(productId);
        await user.save();

        return res.status(STATUS_CODES.OK).json({ status: true, message: MESSAGES.PRODUCT_ADDED_TO_WISHLIST });

    } catch (error) {
        logger.error(MESSAGES.ERROR_IN_ADDTOWISHLIST, error);
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ status: false, message: MESSAGES.SERVER_ERROR_3 });
    }
};

const removeProduct = async (req,res) => {
    try {

        const productId = req.query.productId;
        const userId = req.session.user;
        const user = await User.findById(userId);
        const index = user.wishlist.indexOf(productId);
        user.wishlist.splice(index,1);

        await user.save();

        return res.redirect("/wishlist")
        
    } catch (error) {

        logger.error(error);
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({status:false,message: MESSAGES.SERVER_ERROR})
        
    }
}



export default {
    loadWishlist,
    addToWishlist,
    removeProduct,
}