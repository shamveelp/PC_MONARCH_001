const Coupon = require("../../models/couponSchema")
const User = require("../../models/userSchema")


const loadCoupons = async (req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const coupons = await Coupon.find({})
        
        res.render("my-coupons",{
            coupons:coupons,
            user:userData
        })

    } catch (error) {

        res.redirect("/pageerror")
        
    }
}





module.exports = {
    loadCoupons,
}