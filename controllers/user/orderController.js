const Order = require("../../models/orderSchema")
const User = require("../../models/userSchema")
const Product = require("../../models/productSchema")
const Category = require("../../models/categorySchema")
const Coupon = require("../../models/couponSchema")
const Address = require("../../models/addressSchema")
const Wallet = require("../../models/walletSchema")
const Razorpay = require("razorpay")
const crypto = require("crypto")
const env = require("dotenv").config()

const DELIVERY_CHARGE = 50 // Fixed delivery charge

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})

// Helper function to distribute discount proportionally
const distributeDiscount = (cartItems, totalDiscount) => {
  const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  return cartItems.map((item) => {
    const itemTotal = item.price * item.quantity
    const discountShare = (itemTotal / totalAmount) * totalDiscount
    return {
      ...item,
      discountedPrice: item.price - discountShare / item.quantity,
    }
  })
}

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user
    const { addressId, paymentMethod, couponCode } = req.body

    const user = await User.findById(userId).populate({
      path: "cart.productId",
      model: "Product",
    })

    if (!user || user.cart.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      })
    }

    const address = await Address.findOne({ userId: userId, "address._id": addressId })
    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Address not found",
      })
    }

    const selectedAddress = address.address.find((addr) => addr._id.toString() === addressId)

    // Calculate total and apply coupon if present
    const totalAmount = user.cart.reduce((sum, item) => sum + item.productId.salePrice * item.quantity, 0)
    let discount = 0
    let couponApplied = false

    if (couponCode) {
      const coupon = await Coupon.findOne({ name: couponCode, isList: true })
      if (coupon && !coupon.userId.includes(userId)) {
        discount = coupon.offerPrice
        couponApplied = true
        // Mark coupon as used
        await Coupon.findByIdAndUpdate(coupon._id, {
          $push: { userId: userId },
        })
      }
    }

    const finalAmount = totalAmount - discount + DELIVERY_CHARGE
    const discountedItems = distributeDiscount(
      user.cart.map((item) => ({
        product: item.productId._id,
        quantity: item.quantity,
        price: item.productId.salePrice,
      })),
      discount,
    )

    // Create orders with distributed discount
    const orders = await Promise.all(
      discountedItems.map(async (item) => {
        const product = await Product.findById(item.product).select("regularPrice") // Fetch regular price
        const order = new Order({
          userId: userId,
          orderedItems: [
            {
              product: item.product,
              quantity: item.quantity,
              price: item.discountedPrice,
              regularPrice: product.regularPrice,
              status: "pending",
            },
          ],
          totalPrice: item.price * item.quantity,
          discount: item.price * item.quantity - item.discountedPrice * item.quantity,
          finalAmount: item.discountedPrice * item.quantity + DELIVERY_CHARGE / discountedItems.length,
          address: selectedAddress,
          status: "pending",
          paymentMethod: paymentMethod,
          couponApplied: couponApplied,
          deliveryCharge: DELIVERY_CHARGE / discountedItems.length,
          createdOn: new Date(),
        })

        await Product.findByIdAndUpdate(item.product, {
          $inc: { quantity: -item.quantity },
        })

        return order.save()
      }),
    )

    // Clear cart
    await User.findByIdAndUpdate(userId, { $set: { cart: [] } })

    res.json({
      success: true,
      orderIds: orders.map((order) => order.orderId),
      message: "Orders placed successfully",
    })
  } catch (error) {
    console.error("Error in placeOrder:", error)
    res.status(500).json({
      success: false,
      message: "Failed to place order",
    })
  }
}

const getOrders = async (req, res) => {
  try {
    const userId = req.session.user
    const orders = await Order.find({ userId })
      .populate({
        path: "orderedItems.product",
        select: "productName productImage price",
      })
      .sort({ createdOn: -1 })
      const categories = await Category.find({isListed:true})
        let productData = await Product.find({
            isBlocked:false,
            category:{$in:categories.map(category=>category._id)},
            quantity:{$gt:0},
        })

    const user = await User.findById(userId)

    res.render("orders", {
      orders: orders,
      user: user,
      product:productData
    })
  } catch (error) {
    console.error("Error in getOrders:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

const loadOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user
    const orderId = req.query.orderId

    const order = await Order.findOne({ orderId: orderId, userId }).populate({
      path: "orderedItems.product",
      select: "productName productImage price",
    })

    if (!order) {
      return res.status(404).send("Order not found")
    }

    const user = await User.findById(userId)

    res.render("order-details", {
      order,
      user,
    })
  } catch (error) {
    console.error("Error in loadOrderDetails:", error)
    res.status(500).send("Internal server error")
  }
}

const cancelOrder = async (req, res) => {
  try {
      const { orderId, reason } = req.body;
      const userId = req.session.user;

      const order = await Order.findOne({ _id: orderId, userId });
      if (!order) {
          return res.status(404).json({ success: false, message: "Order not found" });
      }

      if (order.status !== 'cancelled' && order.status !== 'delivered') {
          order.status = 'cancelled';
          order.cancelReason = reason;
          order.orderedItems[0].status = 'cancelled';
          order.orderedItems[0].cancelReason = reason;

          // Return product quantity to stock
          await Product.findByIdAndUpdate(order.orderedItems[0].product, {
              $inc: { quantity: order.orderedItems[0].quantity }
          });

          // Process refund for online and wallet payments
          if (order.paymentMethod === 'online' || order.paymentMethod === 'wallet') {
              let wallet = await Wallet.findOne({ userId });
              if (!wallet) {
                  wallet = new Wallet({ userId, balance: 0 });
              }

              const refundAmount = order.finalAmount - order.deliveryCharge;
              wallet.balance += refundAmount;
              wallet.refundAmount += refundAmount;
              wallet.transactions.push({
                  amount: refundAmount,
                  transactionType: 'credit',
                  transactionPurpose: 'refund',
                  description: `Refund for cancelled order #${order.orderId}`
              });

              await wallet.save();
          }

          await order.save();
          res.json({ success: true, message: "Order cancelled successfully" });
      } else {
          res.status(400).json({ success: false, message: "Order cannot be cancelled" });
      }
  } catch (error) {
      console.error("Error in cancelOrder:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.user
    const { addressId, couponCode } = req.body

    const user = await User.findById(userId).populate({
      path: "cart.productId",
      model: "Product",
    })

    if (!user || user.cart.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      })
    }

    const totalAmount = user.cart.reduce((sum, item) => sum + item.productId.salePrice * item.quantity, 0)
    let discount = 0

    if (couponCode) {
      const coupon = await Coupon.findOne({ name: couponCode, isList: true })
      if (coupon && !coupon.userId.includes(userId)) {
        discount = coupon.offerPrice
      }
    }

    const finalAmount = totalAmount - discount + DELIVERY_CHARGE

    const razorpayOrder = await razorpay.orders.create({
      amount: finalAmount * 100, // Amount in paise
      currency: "INR",
      receipt: `order_${Date.now()}`,
    })

    res.json({
      success: true,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      orderId: razorpayOrder.id,
      amount: finalAmount * 100,
      currency: "INR",
      customerName: user.name,
      customerEmail: user.email,
      customerPhone: user.phone,
    })
  } catch (error) {
    console.error("Error in createRazorpayOrder:", error)
    res.status(500).json({
      success: false,
      message: "Failed to create order",
    })
  }
}

const verifyPayment = async (req, res) => {
  try {
    const { paymentResponse, orderData } = req.body

    const sign = paymentResponse.razorpay_order_id + "|" + paymentResponse.razorpay_payment_id
    const expectedSign = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(sign).digest("hex")

    if (expectedSign !== paymentResponse.razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      })
    }

    // Place order with payment method as 'online'
    orderData.paymentMethod = "online"
    const result = await placeOrder(
      {
        session: { user: req.session.user },
        body: orderData,
      },
      res,
    )

    return result
  } catch (error) {
    console.error("Error in verifyPayment:", error)
    res.status(500).json({
      success: false,
      message: "Payment verification failed",
    })
  }
}

const placeWalletOrder = async (req, res) => {
  try {
    const userId = req.session.user
    const { addressId, couponCode } = req.body

    const user = await User.findById(userId).populate({
      path: "cart.productId",
      model: "Product",
    })

    if (!user || user.cart.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      })
    }

    const wallet = await Wallet.findOne({ userId: userId })
    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: "Wallet not found",
      })
    }

    const totalAmount = user.cart.reduce((sum, item) => sum + item.productId.salePrice * item.quantity, 0)
    let discount = 0

    if (couponCode) {
      const coupon = await Coupon.findOne({ name: couponCode, isList: true })
      if (coupon && !coupon.userId.includes(userId)) {
        discount = coupon.offerPrice
        await Coupon.findByIdAndUpdate(coupon._id, {
          $push: { userId: userId },
        })
      }
    }

    const finalAmount = totalAmount - discount + DELIVERY_CHARGE

    if (wallet.balance < finalAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      })
    }

    const address = await Address.findOne({ userId: userId, "address._id": addressId })
    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Address not found",
      })
    }

    const selectedAddress = address.address.find((addr) => addr._id.toString() === addressId)

    // Create orders
    const orders = await Promise.all(
      user.cart.map(async (item) => {
        const order = new Order({
          userId: userId,
          orderedItems: [
            {
              product: item.productId._id,
              quantity: item.quantity,
              price: item.productId.salePrice,
              status: "pending",
            },
          ],
          totalPrice: item.productId.salePrice * item.quantity,
          discount: ((item.productId.salePrice * item.quantity) / totalAmount) * discount,
          finalAmount:
            item.productId.salePrice * item.quantity -
            ((item.productId.salePrice * item.quantity) / totalAmount) * discount +
            DELIVERY_CHARGE / user.cart.length,
          address: selectedAddress,
          status: "pending",
          paymentMethod: "wallet",
          couponApplied: couponCode ? true : false,
          deliveryCharge: DELIVERY_CHARGE / user.cart.length,
          createdOn: new Date(),
        })

        await Product.findByIdAndUpdate(item.productId._id, {
          $inc: { quantity: -item.quantity },
        })

        return order.save()
      }),
    )

    // Deduct amount from wallet
    wallet.balance -= finalAmount
    wallet.transactions.push({
      amount: finalAmount,
      transactionType: "debit",
      transactionPurpose: "purchase",
      description: "Order payment",
    })
    await wallet.save()

    // Clear cart
    await User.findByIdAndUpdate(userId, { $set: { cart: [] } })

    res.json({
      success: true,
      orderIds: orders.map((order) => order.orderId),
      message: "Orders placed successfully",
    })
  } catch (error) {
    console.error("Error in placeWalletOrder:", error)
    res.status(500).json({
      success: false,
      message: "Failed to place order",
    })
  }
}


const requestReturn = async (req, res) => {
  try {
      const { orderId, returnReason, returnDescription } = req.body; // Changed from reason to returnReason
      const userId = req.session.user;
      const files = req.files;

      const order = await Order.findOne({ _id: orderId, userId });
      if (!order) {
          return res.status(404).json({ success: false, message: "Order not found" });
      }

      // Check if order is delivered and within return period
      const deliveryDate = new Date(order.updatedAt);
      const currentDate = new Date();
      const daysSinceDelivery = Math.floor((currentDate - deliveryDate) / (1000 * 60 * 60 * 24));

      if (order.status !== 'delivered' || daysSinceDelivery > 7) {
          return res.status(400).json({ 
              success: false, 
              message: "Order is not eligible for return" 
          });
      }

      // Process uploaded images
      let imagePaths = [];
      if (files && files.length > 0) {
          imagePaths = files.map(file => `uploads/returns/${file.filename}`);
      }

      // Update order status
      order.status = 'return_requested';
      order.returnReason = returnReason; // Using returnReason instead of reason
      order.returnDescription = returnDescription;
      order.returnImages = imagePaths;
      order.requestStatus = 'pending';
      
      // Update ordered items status
      order.orderedItems[0].status = 'return_requested';
      order.orderedItems[0].returnReason = returnReason; // Using returnReason instead of reason
      order.orderedItems[0].returnDescription = returnDescription;
      order.orderedItems[0].returnImages = imagePaths;
      order.orderedItems[0].requestStatus = 'pending';

      await order.save();

      res.json({ 
          success: true, 
          message: "Return request submitted successfully" 
      });

  } catch (error) {
      console.error("Error in requestReturn:", error);
      res.status(500).json({ 
          success: false, 
          message: "Internal server error" 
      });
  }
};

const processRefund = async (userId, order) => {
  try {
      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
          wallet = new Wallet({ userId, balance: 0 });
      }

      // Calculate refund amount (excluding delivery charge)
      const refundAmount = order.finalAmount - order.deliveryCharge;

      // Update wallet
      wallet.balance += refundAmount;
      wallet.refundAmount += refundAmount;
      wallet.transactions.push({
          amount: refundAmount,
          transactionType: 'credit',
          transactionPurpose: 'refund',
          description: `Refund for order #${order.orderId}`
      });

      await wallet.save();
      return true;
  } catch (error) {
      console.error("Error processing refund:", error);
      return false;
  }
};


const cancelReturnRequest = async (req, res) => {
  try {
      const { orderId } = req.body;
      const userId = req.session.user;

      const order = await Order.findOne({ _id: orderId, userId });
      if (!order) {
          return res.status(404).json({ success: false, message: "Order not found" });
      }

      if (order.status !== 'return_requested' || order.requestStatus !== 'pending') {
          return res.status(400).json({ 
              success: false, 
              message: "Return request cannot be cancelled" 
          });
      }

      order.status = 'delivered';
      order.returnReason = undefined;
      order.returnImages = [];
      order.requestStatus = undefined;
      order.adminMessage = undefined;
      
      await order.save();

      res.json({ 
          success: true, 
          message: "Return request cancelled successfully" 
      });

  } catch (error) {
      console.error("Error in cancelReturnRequest:", error);
      res.status(500).json({ 
          success: false, 
          message: "Internal server error" 
      });
  }
};




module.exports = {
  placeOrder,
  getOrders,
  loadOrderDetails,
  cancelOrder,
  createRazorpayOrder,
  verifyPayment,
  placeWalletOrder,
  requestReturn,
  processRefund,
  cancelReturnRequest,


}

