const Coupon = require("../../models/couponSchema")
const User = require("../../models/userSchema")

const loadCoupons = async (req, res) => {
  try {
    const userId = req.session.user
    const userData = await User.findById(userId)

    // Get current date
    const currentDate = new Date()

    // Fetch only non-expired coupons
    const coupons = await Coupon.find({
      expireOn: { $gt: currentDate },
      isList: true,
    })

    res.render("my-coupons", {
      coupons: coupons,
      user: userData,
    })
  } catch (error) {
    console.error("Error in loadCoupons:", error)
    res.redirect("/pageerror")
  }
}

module.exports = {
  loadCoupons,
}

