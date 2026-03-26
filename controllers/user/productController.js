import Product from "../../models/productSchema.js";
import Category from "../../models/categorySchema.js";
import User from "../../models/userSchema.js";


const productDetails = async (req,res) => {

    try {

        const userId = req.session.user;
        const userData = await User.findById(userId);
        const productId = req.query.id;
        const product = await Product.findById(productId).populate('category')
        const findCategory = product.category;
        const categoryOffer = findCategory ?. categoryOffer || 0;
        const productOffer = product.productOffer ||0;

        const totalOffer = categoryOffer + productOffer;

        const categories = await Category.find({ isListed: true });
        const categoryIds = categories.map(category => category._id.toString());

        const products = await Product.find({
            isBlocked: false,
            category: { $in: categoryIds },
            quantity: { $gt: 0 },
        })
        .sort({ createdOn: -1 })
        .skip(0)
        .limit(9);

        res.render("product-details",{
            user:userData,
            product:product,
            products: products,
            quantity:product.quantity,
            totalOffer:totalOffer,
            category:findCategory
        })


    } catch (error) {
        
        console.error("Error for fetching product details",error)
        res.redirect("/pageNotFound")
    }
}


export default {
    productDetails
}
