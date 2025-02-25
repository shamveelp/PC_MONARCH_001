const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Address = require("../../models/addressSchema");
const Coupon = require("../../models/couponSchema");
const Wallet = require("../../models/walletSchema");

const loadCheckoutPage = async (req, res) => {
  try {
      const userId = req.session.user;
      const user = await User.findById(userId).populate({
          path: "cart.productId",
          model: "Product",
          populate: {
              path: "category",
              model: "Category",
          },
      });
      const wallet = await Wallet.findOne({ userId: userId });
        
      let transactions = [];
      if (wallet) {
          transactions = wallet.transactions.sort((a, b) => b.createdAt - a.createdAt);
      }

      const addressData = await Address.findOne({ userId: userId });

      if (!user) {
          return res.status(404).send("User not found");
      }

      // Filter out blocked products, unlisted categories, and products with quantity <= 0
      const cartItems = user.cart
          .filter(item => 
              item.productId && 
              !item.productId.isBlocked && 
              item.productId.category && 
              item.productId.category.isListed && 
              item.productId.quantity > 0 // Added quantity check
          )
          .map((item) => ({
              product: item.productId,
              quantity: item.quantity,
              totalPrice: item.productId.salePrice * item.quantity,
          }));

      const subtotal = cartItems.reduce((total, item) => total + item.totalPrice, 0);
      const shippingCharge = 0; // Free shipping
      const grandTotal = subtotal + shippingCharge;

      res.render("checkout", {
          user,
          cartItems,
          subtotal,
          shippingCharge,
          grandTotal,
          userAddress: addressData,
          wallet: wallet || { balance: 0, refundAmount: 0, totalDebited: 0 },
      });
  } catch (error) {
      console.error("Error in loadCheckoutPage:", error);
      res.redirect("/pageNotFound");
  }
};

const addAddressCheckout = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findById(user);
        res.render("add-address-checkout", {
            theUser: user,
            user: userData
        });
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const postAddAddressCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findOne({ _id: userId });
        const { addressType, name, country, city, landMark, state, streetAddress, pincode, phone, email, altPhone } = req.body;

        const userAddress = await Address.findOne({ userId: userData._id });
        
        if (!userAddress) {
            const newAddress = new Address({
                userId: userData,
                address: [{ addressType, name, country, city, landMark, state, streetAddress, pincode, phone, email, altPhone }]
            });
            await newAddress.save();
        } else {
            userAddress.address.push({ addressType, name, country, city, landMark, state, streetAddress, pincode, phone, email, altPhone });
            await userAddress.save();
        }

        res.redirect("/checkout");
    } catch (error) {
        console.error("Error adding address", error);
        res.redirect("/pageNotFound");
    }
};

const applyCoupon = async (req, res) => {
    try {
        const { couponCode, subtotal } = req.body;
        const userId = req.session.user;

        const coupon = await Coupon.findOne({ name: couponCode, isList: true });

        if (!coupon) {
            return res.json({ success: false, message: 'Invalid coupon code' });
        }

        if (new Date() > coupon.expireOn) {
            return res.json({ success: false, message: 'Coupon has expired' });
        }

        if (subtotal < coupon.minimumPrice) {
            return res.json({ success: false, message: `Minimum purchase amount should be ₹${coupon.minimumPrice}` });
        }

        if (coupon.userId.includes(userId)) {
            return res.json({ success: false, message: 'You have already used this coupon' });
        }

        res.json({ success: true, coupon: coupon });
    } catch (error) {
        console.error('Error applying coupon:', error);
        res.status(500).json({ success: false, message: 'An error occurred while applying the coupon' });
    }
};

module.exports = {
    loadCheckoutPage,
    postAddAddressCheckout,
    addAddressCheckout,
    applyCoupon,
};