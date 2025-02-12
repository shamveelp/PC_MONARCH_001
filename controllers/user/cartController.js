const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema")

const getCartPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).populate({
      path: 'cart.productId',
      model: 'Product',
      populate: {
        path: 'category', // Populate the category inside the product
        model: 'Category'
      }
    });

    if (!user) {
      return res.status(404).send('User not found');
    }

    const cartItems = user.cart.map(item => ({
      product: item.productId,
      quantity: item.quantity,
      totalPrice: item.productId.salePrice * item.quantity
    }));

    const grandTotal = cartItems.reduce((total, item) => total + item.totalPrice, 0);

  

    res.render("cart", {
      user,
      cartItems,
      grandTotal,
      
    });
  } catch (error) {
    console.error('Error in getCartPage:', error);
    res.status(500).send('An error occurred while loading the cart');
  }
};

const addToCart = async (req, res) => {
  try {
    const productId = req.body.productId;
    const userId = req.session.user;

    const user = await User.findById(userId);
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ status: false, message: "Product not found" });
    }

    if (product.quantity <= 0) {
      return res.status(400).json({ status: false, message: "Product is out of stock" });
    }

    const cartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId);

    if (cartItemIndex > -1) {
      // Product already in cart, increase quantity
      if (user.cart[cartItemIndex].quantity >= product.quantity) {
        return res.status(400).json({ status: false, message: "Cannot add more, product is out of stock" });
      }
      user.cart[cartItemIndex].quantity += 1;
    } else {
      // Add new product to cart
      user.cart.push({ productId: productId, quantity: 1 });
    }

    await user.save();
    return res.json({ status: true, message: "Product added to cart", cartLength: user.cart.length });
  } catch (error) {
    console.error('Error in addToCart:', error);
    return res.status(500).json({ status: false, message: "An error occurred while adding to cart" });
  }
};

const changeQuantity = async (req, res) => {
  try {
    const { productId, action } = req.body;
    const userId = req.session.user;

    const user = await User.findById(userId);
    const product = await Product.findById(productId);

    if (!user || !product) {
      return res.status(404).json({ status: false, message: "User or Product not found" });
    }

    const cartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId);

    if (cartItemIndex === -1) {
      return res.status(404).json({ status: false, message: "Product not found in cart" });
    }

    let newQuantity = user.cart[cartItemIndex].quantity;

    if (action === 'increase') {
      if (newQuantity >= product.quantity) {
        return res.status(400).json({ status: false, message: "Cannot add more, product is out of stock" });
      }
      newQuantity += 1;
    } else if (action === 'decrease') {
      if (newQuantity > 1) {
        newQuantity -= 1;
      } else {
        // Remove item if quantity becomes 0
        user.cart.splice(cartItemIndex, 1);
        await user.save();
        return res.json({ status: true, message: "Product removed from cart", quantity: 0 });
      }
    } else {
      return res.status(400).json({ status: false, message: "Invalid action" });
    }

    user.cart[cartItemIndex].quantity = newQuantity;
    await user.save();

    // Recalculate cart total
    const updatedUser = await User.findById(userId).populate({
      path: 'cart.productId',
      model: 'Product'
    });
    const grandTotal = updatedUser.cart.reduce((total, item) => total + (item.productId.salePrice * item.quantity), 0);

    return res.json({ 
      status: true, 
      message: "Cart updated", 
      quantity: newQuantity, 
      grandTotal: grandTotal 
    });
  } catch (error) {
    console.error('Error in changeQuantity:', error);
    return res.status(500).json({ status: false, message: "An error occurred while updating the cart" });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const productId = req.query.id;
    const userId = req.session.user;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const cartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId);

    if (cartItemIndex === -1) {
      return res.status(404).json({ status: false, message: "Product not found in cart" });
    }

    user.cart.splice(cartItemIndex, 1);
    await user.save();

    return res.json({ status: true, message: "Product removed from cart" });
  } catch (error) {
    console.error('Error in deleteProduct:', error);
    return res.status(500).json({ status: false, message: "An error occurred while removing the product from cart" });
  }
};

module.exports = {
  getCartPage,
  addToCart,
  changeQuantity,
  deleteProduct
};