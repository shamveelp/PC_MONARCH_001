const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Address = require("../../models/addressSchema"); // Assuming you have an Address model



const loadCheckoutPage = async (req, res) => {
    try {
      const userId = req.session.user
      const user = await User.findById(userId).populate({
        path: "cart.productId",
        model: "Product",
        populate: {
          path: "category",
          model: "Category",
        },
      })
  
      const addressData = await Address.findOne({ userId: userId })
  
      if (!user) {
        return res.status(404).send("User not found")
      }
  
      const cartItems = user.cart.map((item) => ({
        product: item.productId,
        quantity: item.quantity,
        totalPrice: item.productId.salePrice * item.quantity,
      }))
  
      const subtotal = cartItems.reduce((total, item) => total + item.totalPrice, 0)
      const shippingCharge = 0 // Free shipping
      const grandTotal = subtotal + shippingCharge
  
      res.render("checkout", {
        user,
        cartItems,
        subtotal,
        shippingCharge,
        grandTotal,
        userAddress: addressData,
      })
    } catch (error) {
      console.error("Error in loadCheckoutPage:", error)
      res.redirect("/pageNotFound")
    }
  }

const addAddressCheckout = async (req,res) => {
    try {
        
        const user = req.session.user;
        const userData = await User.findById(user);
        res.render("add-address-checkout",{
            
            theUser:user,
            user:userData
        })

    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
}


const postAddAddressCheckout = async (req,res) => {
    try {
        
        const userId = req.session.user;
        const userData = await User.findOne({_id:userId})
        const { addressType, name, country, city, landMark, state, streetAddress, pincode, phone, email, altPhone } = req.body;

        const userAddress = await Address.findOne({userId:userData._id});
        
        if(!userAddress){
            const newAddress = new Address({
                userId:userData,
                address: [{addressType, name, country, city, landMark, state, streetAddress, pincode, phone, email, altPhone}]

            });
            await newAddress.save();
        }else{
            userAddress.address.push({addressType, name, country, city, landMark, state, streetAddress, pincode, phone, email, altPhone})
            await userAddress.save();
        }

        res.redirect("/checkout")

    } catch (error) {

        console.error("Error adding address",error)

        res.redirect("/pageNotFound")
        
    }
}




module.exports = {
    loadCheckoutPage,
    postAddAddressCheckout,
    addAddressCheckout,


}