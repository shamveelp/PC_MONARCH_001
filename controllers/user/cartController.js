import logger from '../../utils/logger.js';
import User from "../../models/userSchema.js";
import Product from "../../models/productSchema.js";
import Category from "../../models/categorySchema.js";


import STATUS_CODES from '../../enums/statusCodes.js';
import MESSAGES from '../../enums/constants.js';

const removeBlockedOrUnlistedItems = async (user) => {
  const updatedCart = [];
  for (const item of user.cart) {
    const product = await Product.findById(item.productId).populate('category');
    if (product && product.isBlocked === false && product.category.isListed && product.quantity > 0) {
      const adjustedQuantity = Math.min(item.quantity, product.quantity);
      updatedCart.push({ productId: item.productId, quantity: adjustedQuantity });
    }
    
  }
  user.cart = updatedCart;
  await user.save();
};

const getCartPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).populate({
      path: 'cart.productId',
      model: 'Product',
      populate: {
        path: 'category',
        model: 'Category'
      }
    });

    if (!user) {
      return res.status(STATUS_CODES.NOT_FOUND).send(MESSAGES.USER_NOT_FOUND);
    }

    
    for (let i = user.cart.length - 1; i >= 0; i--) {
      const item = user.cart[i];
      if (item.productId && (item.productId.quantity === 0 || item.quantity > item.productId.quantity)) {
        if (item.productId.quantity === 0) {
          user.cart.splice(i, 1); // Remove if stock is 0
        } else {
          item.quantity = item.productId.quantity; // Adjust to available stock
        }
      }
    }
    await user.save();

    const cartItems = user.cart
      .filter(item => 
        item.productId && 
        !item.productId.isBlocked && 
        item.productId.category && 
        item.productId.category.isListed && 
        item.productId.quantity > 0
      )
      .map(item => ({
        product: item.productId,
        quantity: item.quantity,
        totalPrice: item.productId.salePrice * item.quantity
      }));

    const grandTotal = cartItems.reduce((total, item) => total + item.totalPrice, 0);

    res.render("cart", {
      user,
      cartItems,
      grandTotal
    });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_GETCARTPAGE, error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('An error occurred while loading the cart');
  }
};

const addToCart = async (req, res) => {
  try {
    const productId = req.body.productId;
    const userId = req.session.user;

    const user = await User.findById(userId);
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ status: false, message: MESSAGES.PRODUCT_NOT_FOUND });
    }

    if (product.quantity <= 0) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ status: false, message: MESSAGES.PRODUCT_IS_OUT_OF_STOCK });
    }

    const cartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId);
    let newQuantity;

    if (cartItemIndex > -1) {
      const currentQuantity = user.cart[cartItemIndex].quantity;

      if (currentQuantity >= 5) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({ 
          status: false, 
          message: MESSAGES.MAXIMUM_5_QUANTITY_PER_USER_REACHED, 
          quantity: currentQuantity 
        });
      }

      if (currentQuantity >= product.quantity) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({ 
          status: false, 
          message: MESSAGES.CANNOT_ADD_MORE_PRODUCT_IS_OUT_OF_STOCK, 
          quantity: currentQuantity 
        });
      }

      user.cart[cartItemIndex].quantity += 1;
      newQuantity = user.cart[cartItemIndex].quantity;
    } else {
      user.cart.push({ productId: productId, quantity: 1 });
      newQuantity = 1;
    }

    await user.save();
    return res.json({ 
      status: true, 
      message: MESSAGES.PRODUCT_ADDED_TO_CART, 
      quantity: newQuantity, 
      cartLength: user.cart.length 
    });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_ADDTOCART, error);
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ status: false, message: MESSAGES.AN_ERROR_OCCURRED_WHILE_ADDING_TO_CART });
  }
};

const changeQuantity = async (req, res) => {
  try {
    const { productId, action } = req.body;
    const userId = req.session.user;

    const user = await User.findById(userId);
    const product = await Product.findById(productId);

    if (!user || !product) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ status: false, message: MESSAGES.USER_OR_PRODUCT_NOT_FOUND });
    }

    const cartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId);

    if (cartItemIndex === -1) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ status: false, message: MESSAGES.PRODUCT_NOT_FOUND_IN_CART });
    }

    if (product.quantity === 0) {
      user.cart.splice(cartItemIndex, 1);
      await user.save();
      return res.json({
        status: true,
        message: MESSAGES.PRODUCT_REMOVED_FROM_CART_DUE_TO_ZERO_STOCK,
        quantity: 0,
        swal: {
          title: "Out of Stock!",
          text: "This product is no longer available and has been removed from your cart.",
          icon: "warning",
          confirmButtonText: "OK"
        }
      });
    }

    let newQuantity = user.cart[cartItemIndex].quantity;

    if (action === 'increase') {
      if (newQuantity >= product.quantity) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({ status: false, message: MESSAGES.CANNOT_ADD_MORE_PRODUCT_IS_OUT_OF_STOCK });
      }
      newQuantity += 1;
    } else if (action === 'decrease') {
      if (newQuantity > 1) {
        newQuantity -= 1;
      } else {
        user.cart.splice(cartItemIndex, 1);
        await user.save();
        return res.json({ status: true, message: MESSAGES.PRODUCT_REMOVED_FROM_CART, quantity: 0 });
      }
    } else {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ status: false, message: MESSAGES.INVALID_ACTION });
    }

    if (newQuantity > product.quantity) {
      newQuantity = product.quantity;
    }

    user.cart[cartItemIndex].quantity = newQuantity;
    await user.save();

    const updatedUser = await User.findById(userId).populate({
      path: 'cart.productId',
      model: 'Product'
    });
    const grandTotal = updatedUser.cart.reduce((total, item) => total + (item.productId.salePrice * item.quantity), 0);

    return res.json({ 
      status: true, 
      message: MESSAGES.CART_UPDATED, 
      quantity: newQuantity, 
      grandTotal: grandTotal 
    });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_CHANGEQUANTITY, error);
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ status: false, message: MESSAGES.AN_ERROR_OCCURRED_WHILE_UPDATING_THE_CART });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const productId = req.query.id;
    const userId = req.session.user;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ status: false, message: MESSAGES.USER_NOT_FOUND });
    }

    const cartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId);

    if (cartItemIndex === -1) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ status: false, message: MESSAGES.PRODUCT_NOT_FOUND_IN_CART });
    }

    user.cart.splice(cartItemIndex, 1);
    await user.save();

    return res.json({ status: true, message: MESSAGES.PRODUCT_REMOVED_FROM_CART });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_DELETEPRODUCT, error);
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ status: false, message: MESSAGES.AN_ERROR_OCCURRED_WHILE_REMOVING_THE_PRODUCT_FROM_ });
  }
};

export default {
  getCartPage,
  addToCart,
  changeQuantity,
  deleteProduct
}