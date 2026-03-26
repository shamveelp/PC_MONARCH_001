import Coupon from "../../models/couponSchema.js";
import User from "../../models/userSchema.js";

const loadCoupons = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);

    const currentDate = new Date();

    const coupons = await Coupon.find({
      expireOn: { $gt: currentDate },
      isList: true,
    }).sort({ createdOn: -1 }); 

    const couponsWithStatus = coupons.map(coupon => {
      const isUsed = coupon.userId.includes(userId);
      return {
        ...coupon.toObject(), 
        isUsed: isUsed,
        usageMessage: isUsed ? "Already used, can't use this coupon" : "Available to use"
      };
    });

    res.render("my-coupons", {
      coupons: couponsWithStatus,
      user: userData,
    });
  } catch (error) {
    console.error("Error in loadCoupons:", error);
    res.redirect("/pageerror");
  }
};

export default {
  loadCoupons,
}
