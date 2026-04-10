import logger from '../../utils/logger.js';
import Order from "../../models/orderSchema.js";
import User from "../../models/userSchema.js";
import Product from "../../models/productSchema.js";
import Category from "../../models/categorySchema.js";
import Coupon from "../../models/couponSchema.js";
import Address from "../../models/addressSchema.js";
import Wallet from "../../models/walletSchema.js";
import Transaction from "../../models/transactionSchema.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import 'dotenv/config';

import fs from "fs";
import path from "path";
import ejs from "ejs";
import puppeteer from "puppeteer";
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})

const DELIVERY_CHARGE = 50

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
    let { addressId, paymentMethod, couponCode } = req.body

    if (paymentMethod === "razorpay") {
        paymentMethod = "online";
    }

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

    const totalAmount = user.cart.reduce((sum, item) => sum + item.productId.salePrice * item.quantity, 0)
    let discount = 0
    let couponApplied = false

    if (couponCode) {
      const coupon = await Coupon.findOne({ name: couponCode, isList: true })
      if (coupon && !coupon.userId.includes(userId)) {
        discount = coupon.offerPrice
        couponApplied = true
        await Coupon.findByIdAndUpdate(coupon._id, {
          $push: { userId: userId },
        })
      }
    }

    const finalAmount = totalAmount - discount + DELIVERY_CHARGE
    const discountedItems = distributeDiscount(
      user.cart.map((item) => ({
        product: item.productId._id,
        productName: item.productId.productName,
        productImages: item.productId.productImage,
        quantity: item.quantity,
        price: item.productId.salePrice,
      })),
      discount,
    )

    if (paymentMethod === "cod" && totalAmount > 35000) {
      return res.status(400).json({
        success: false,
        message: "COD not available for orders above ₹35,000",
      })
    }

    const orders = await Promise.all(
      discountedItems.map(async (item) => {
        const product = await Product.findById(item.product).select("regularPrice productName productImage")
        const order = new Order({
          userId: userId,
          orderedItems: [
            {
              product: item.product,
              productName: product.productName,
              productImages: product.productImage,
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
          status: (paymentMethod === "cod" || paymentMethod === "wallet") ? "confirmed" : "pending",
          paymentMethod: paymentMethod,
          couponApplied: couponApplied,
          deliveryCharge: DELIVERY_CHARGE / discountedItems.length,
          createdOn: new Date(),
          updatedOn: new Date(), // Set initial updatedOn timestamp
        })

        await Product.findByIdAndUpdate(item.product, {
          $inc: { quantity: -item.quantity },
        })

        return order.save()
      }),
    )

    if (paymentMethod === "wallet") {
      const wallet = await Wallet.findOne({ userId })

      if (!wallet || wallet.balance < finalAmount) {
        return res.status(400).json({
          success: false,
          message: "Insufficient wallet balance",
        })
      }

      wallet.balance -= finalAmount
      wallet.totalDebited += finalAmount
      wallet.transactions.push({
        amount: finalAmount,
        transactionType: "debit",
        transactionPurpose: "purchase",
        description: "Order payment from wallet",
      })

      await wallet.save()

      await Transaction.create({
        userId: userId,
        amount: finalAmount,
        transactionType: "debit",
        paymentMethod: "wallet",
        paymentGateway: "wallet",
        status: "completed",
        purpose: "purchase",
        description: "Order payment from wallet",
        orders: orders.map((order) => ({
          orderId: order.orderId,
          amount: order.finalAmount,
        })),
        walletBalanceAfter: wallet.balance,
      })
    }

    // Clear cart
    await User.findByIdAndUpdate(userId, { $set: { cart: [] } })

    if (paymentMethod === "online") {
      const razorpayOrder = await razorpay.orders.create({
        amount: finalAmount * 100,
        currency: "INR",
        receipt: `order_${Date.now()}`,
      })

      return res.json({
        success: true,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        orderId: razorpayOrder.id,
        amount: finalAmount * 100,
        currency: "INR",
        customerName: user.name,
        customerEmail: user.email,
        customerPhone: user.phone,
        dbOrderIds: orders.map(o => o._id),
      })
    }

    res.json({
      success: true,
      orderIds: orders.map((order) => order.orderId),
      message: "Orders placed successfully",
    })
  } catch (error) {
    logger.error("Error in placeOrder:", error)
    res.status(500).json({
      success: false,
      message: "Failed to place order",
    })
  }
}

const getOrders = async (req, res) => {
  try {
    const userId = req.session.user
    const orders = await Order.find({ userId }).sort({ createdOn: -1 })
    const categories = await Category.find({ isListed: true })
    const productData = await Product.find({
      isBlocked: false,
      category: { $in: categories.map((category) => category._id) },
      quantity: { $gt: 0 },
    })

    const user = await User.findById(userId)

    res.render("orders", {
      orders: orders,
      user: user,
      product: productData,
    })
  } catch (error) {
    logger.error("Error in getOrders:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

const loadOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user
    const orderId = req.query.orderId

    const order = await Order.findOne({ orderId: orderId, userId })
    if (!order) {
      return res.status(404).send("Order not found")
    }

    const user = await User.findById(userId)

    res.render("order-details", {
      order,
      user,
    })
  } catch (error) {
    logger.error("Error in loadOrderDetails:", error)
    res.status(500).send("Internal server error")
  }
}

const cancelOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body
    const userId = req.session.user

    const order = await Order.findOne({ _id: orderId, userId })
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" })
    }

    if (order.status !== "cancelled" && order.status !== "delivered") {
      order.status = "cancelled"
      order.cancelReason = reason
      order.orderedItems[0].status = "cancelled"
      order.orderedItems[0].cancelReason = reason

      // Update the timestamp when user cancels the order
      order.updatedOn = new Date()

      await Product.findByIdAndUpdate(order.orderedItems[0].product, {
        $inc: { quantity: order.orderedItems[0].quantity },
      })

      if (order.paymentMethod === "online" || order.paymentMethod === "wallet") {
        const refundSuccess = await processRefund(userId, order)
        if (!refundSuccess) {
          return res.status(500).json({
            success: false,
            message: "Failed to process refund",
          })
        }
      }

      await order.save()
      res.json({ success: true, message: "Order cancelled successfully" })
    } else {
      res.status(400).json({ success: false, message: "Order cannot be cancelled" })
    }
  } catch (error) {
    logger.error("Error in cancelOrder:", error)
    res.status(500).json({ success: false, message: "Internal server error" })
  }
}

const requestReturn = async (req, res) => {
  try {
    const { orderId, returnReason, returnDescription } = req.body
    const userId = req.session.user
    const files = req.files

    const order = await Order.findOne({ _id: orderId, userId })
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" })
    }

    const deliveryDate = new Date(order.updatedAt)
    const currentDate = new Date()
    const daysSinceDelivery = Math.floor((currentDate - deliveryDate) / (1000 * 60 * 60 * 24))

    if (order.status !== "delivered" || daysSinceDelivery > 7) {
      return res.status(400).json({
        success: false,
        message: "Order is not eligible for return",
      })
    }

    let imagePaths = []
    if (files && files.length > 0) {
      imagePaths = files.map((file) => `uploads/returns/${file.filename}`)
    }

    order.status = "return_requested"
    order.returnReason = returnReason
    order.returnDescription = returnDescription
    order.returnImages = imagePaths
    order.requestStatus = "pending"

    // Update the timestamp when return is requested
    order.updatedOn = new Date()

    await order.save()

    res.json({
      success: true,
      message: "Return request submitted successfully",
    })
  } catch (error) {
    logger.error("Error in requestReturn:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
    })
  }
}

const processRefund = async (userId, order) => {
  try {
    let wallet = await Wallet.findOne({ userId })
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 })
    }

    const refundAmount = order.finalAmount - order.deliveryCharge

    wallet.balance += refundAmount
    wallet.refundAmount += refundAmount
    wallet.transactions.push({
      amount: refundAmount,
      transactionType: "credit",
      transactionPurpose: "refund",
      description: `Refund for ${order.status === "cancelled" ? "cancelled" : "returned"} order #${order.orderId}`,
    })

    await wallet.save()

    await Transaction.create({
      userId: userId,
      amount: refundAmount,
      transactionType: "credit",
      paymentMethod: "refund",
      paymentGateway: order.paymentMethod === "online" ? "razorpay" : "wallet",
      status: "completed",
      purpose: order.status === "cancelled" ? "cancellation" : "return",
      description: `Refund for ${order.status === "cancelled" ? "cancelled" : "returned"} order #${order.orderId}`,
      orders: [
        {
          orderId: order.orderId,
          amount: refundAmount,
        },
      ],
      walletBalanceAfter: wallet.balance,
    })

    return true
  } catch (error) {
    logger.error("Error processing refund:", error)
    return false
  }
}

const cancelReturnRequest = async (req, res) => {
  try {
    const { orderId } = req.body
    const userId = req.session.user

    const order = await Order.findOne({ _id: orderId, userId })
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" })
    }

    if (order.status !== "return_requested" || order.requestStatus !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Return request cannot be cancelled",
      })
    }

    order.status = "delivered"
    order.returnReason = undefined
    order.returnDescription = undefined
    order.returnImages = []
    order.requestStatus = undefined
    order.adminMessage = undefined

    // Update the timestamp when return request is cancelled
    order.updatedOn = new Date()

    await order.save()

    res.json({
      success: true,
      message: "Return request cancelled successfully",
    })
  } catch (error) {
    logger.error("Error in cancelReturnRequest:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
    })
  }
}

const generateInvoice = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.query.orderId;

    const order = await Order.findOne({ orderId: orderId, userId });
    if (!order) {
      return res.status(404).send("Order not found");
    }

    if (order.status !== "delivered") {
      return res.status(400).send("Invoice is only available for delivered orders");
    }

    if (!order.invoiceDate) {
      order.invoiceDate = new Date();
      await order.save();
    }

    
    const invoiceDir = path.join(__dirname, "../../public/invoices");
    if (!fs.existsSync(invoiceDir)) {
      fs.mkdirSync(invoiceDir, { recursive: true });
    }

    
    const fileName = `invoice-${order.orderId}.pdf`;
    const filePath = path.join(invoiceDir, fileName);

    
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

   
    doc.fontSize(20).text('PC MONARCH', { align: 'center' });
    doc.fontSize(12).text('Invoice', { align: 'center' });
    doc.moveDown();

   
    doc.fontSize(12).text(`Invoice #: ${order.orderId}`);
    doc.text(`Date: ${new Date(order.invoiceDate || order.createdOn).toLocaleDateString()}`);
    doc.moveDown();

   
    doc.fontSize(10);
    const companyX = 50;
    const customerX = 300;
    
    doc.text('From:', companyX);
    doc.text('PC Monarch', companyX);
    doc.text('Calicut, Kakkanchery', companyX);
    doc.text('Brototype, Kinfra', companyX);
    doc.text('Phone: +00 000 0000 000', companyX);
    doc.text('Email: pcmonarch@gmail.com', companyX);

    
    doc.text('Bill To:', customerX);
    doc.text(order.address.name, customerX);
    doc.text(order.address.email, customerX);
    doc.text(order.address.phone, customerX);
    doc.text(order.address.streetAddress, customerX);
    doc.text(`${order.address.city}, ${order.address.state} ${order.address.pincode}`, customerX);

    doc.moveDown();

    
    const tableTop = 300;
    let currentY = tableTop;

  
    doc.fontSize(10);
    doc.text('Product', 50, currentY);
    doc.text('Quantity', 250, currentY);
    doc.text('Price', 350, currentY);
    doc.text('Total', 450, currentY);

    currentY += 20;

    
    order.orderedItems.forEach(item => {

      const productName = item.productName.split('|')[0].trim();

      doc.text(productName, 50, currentY);
      doc.text(item.quantity.toString(), 250, currentY);
      doc.text(`Rs. ${item.price.toFixed(2)}`, 350, currentY);
      doc.text(`Rs. ${(item.price * item.quantity).toFixed(2)}`, 450, currentY);
      currentY += 20;
    });

    doc.moveDown();
    currentY += 20;

   
    doc.text(`Subtotal: Rs. ${order.totalPrice.toFixed(2)}`, 350, currentY);
    currentY += 20;
    
    if (order.discount > 0) {
      doc.text(`Discount: -Rs. ${order.discount.toFixed(2)}`, 350, currentY);
      currentY += 20;
    }
    
    doc.text(`Delivery Charge: Rs. ${order.deliveryCharge.toFixed(2)}`, 350, currentY);
    currentY += 20;
    
    doc.fontSize(12).text(`Grand Total: Rs. ${order.finalAmount.toFixed(2)}`, 350, currentY);

    
    doc.fontSize(10).text('Thank you for your purchase!', 50, 700, { align: 'center' });
    doc.text('For any questions or concerns regarding this invoice, please contact our customer support.', { align: 'center' });

    doc.end();

   
    stream.on('finish', () => {
    
      res.download(filePath, fileName, (err) => {
        if (err) {
          logger.error("Error sending file:", err);
          res.status(500).send("Error generating invoice");
        }
        
        
        fs.unlink(filePath, (err) => {
          if (err) logger.error("Error deleting temporary file:", err);
        });
      });
    });

  } catch (error) {
    logger.error("Error generating invoice:", error);
    res.status(500).send("Error generating invoice");
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
      amount: finalAmount * 100,
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
    logger.error("Error in createRazorpayOrder:", error)
    res.status(500).json({
      success: false,
      message: "Failed to create order",
    })
  }
}

const verifyPayment = async (req, res) => {
  try {
    const { paymentResponse, dbOrderIds } = req.body
    const userId = req.session.user

    const sign = paymentResponse.razorpay_order_id + "|" + paymentResponse.razorpay_payment_id
    const expectedSign = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(sign).digest("hex")

    if (expectedSign !== paymentResponse.razorpay_signature) {
      await Order.updateMany(
        { _id: { $in: dbOrderIds } },
        { $set: { paymentStatus: "Failed" } }
      )
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      })
    }

    const orders = await Order.find({ _id: { $in: dbOrderIds } });
    if (!orders || orders.length === 0) {
      return res.status(404).json({ success: false, message: "Orders not found" });
    }

    // Update orders to confirmed and paymentStatus to Success
    for (const order of orders) {
      order.status = "confirmed";
      order.paymentStatus = "Success";
      order.orderedItems[0].status = "confirmed";
      await order.save();
    }

    const totalAmount = orders.reduce((sum, order) => sum + order.finalAmount, 0)

    try {
      await Transaction.create({
        userId: userId,
        amount: totalAmount,
        transactionType: "debit",
        paymentMethod: "online",
        paymentGateway: "razorpay",
        gatewayTransactionId: paymentResponse.razorpay_payment_id,
        status: "completed",
        purpose: "purchase",
        description: "Online payment for order",
        orders: orders.map((order) => ({
          orderId: order.orderId,
          amount: order.finalAmount,
        })),
      })
    } catch (txnError) {
      logger.error("Error creating transaction record:", txnError);
    }

    res.json({
      success: true,
      orderIds: orders.map(o => o.orderId),
      message: "Payment verified successfully"
    })
  } catch (error) {
    logger.error("Error in verifyPayment:", error)
    res.status(500).json({
      success: false,
      message: "Payment verification failed",
    })
  }
}

const paymentFailure = async (req, res) => {
  try {
      const { dbOrderIds } = req.body;
      if (dbOrderIds && dbOrderIds.length > 0) {
        await Order.updateMany(
          { _id: { $in: dbOrderIds } },
          { $set: { paymentStatus: "Failed" } }
        )
      }
      res.json({ success: true, message: "Updated payment status to Failed" });
  } catch (error) {
      logger.error("Error in paymentFailure:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
  }
}

const repayOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ _id: orderId, userId: userId });
    
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status !== "pending") {
      return res.status(400).json({ success: false, message: "Order cannot be repaid" });
    }

    const timePassedMs = Date.now() - new Date(order.createdOn).getTime();
    if (timePassedMs > 15 * 60 * 1000) {
      // Past 15 minutes
      // Let's cancel the order to free stock
      order.status = "cancelled";
      order.cancelReason = "Payment timeout";
      order.orderedItems[0].status = "cancelled";
      await order.save();
      
      // return stock
      await Product.findByIdAndUpdate(order.orderedItems[0].product, {
        $inc: { quantity: order.orderedItems[0].quantity },
      })
      return res.status(400).json({ success: false, message: "Payment time limit exceeded (15 mins). Order cancelled." });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: order.finalAmount * 100,
      currency: "INR",
      receipt: `repay_${order.orderId}`,
    })

    const user = await User.findById(userId);

    res.json({
      success: true,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: razorpayOrder.id,
      amount: order.finalAmount * 100,
      currency: "INR",
      customerName: user.name,
      customerEmail: user.email,
      customerPhone: user.phone,
      dbOrderId: order._id
    })

  } catch (error) {
    logger.error("Error in repayOrder:", error)
    res.status(500).json({
      success: false,
      message: "Failed to initiate payment",
    })
  }
}

const loadPaymentSuccess = async (req, res) => {
    res.render("payment-success");
}

const loadPaymentFailed = async (req, res) => {
    res.render("payment-failed");
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

    const address = await Address.findOne({ userId: userId, "address._id": addressId })
    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Address not found",
      })
    }

    const selectedAddress = address.address.find((addr) => addr._id.toString() === addressId)

    const totalAmount = user.cart.reduce((sum, item) => sum + item.productId.salePrice * item.quantity, 0)
    let discount = 0
    let couponApplied = false

    if (couponCode) {
      const coupon = await Coupon.findOne({ name: couponCode, isList: true })
      if (coupon && !coupon.userId.includes(userId)) {
        discount = coupon.offerPrice
        couponApplied = true
        await Coupon.findByIdAndUpdate(coupon._id, {
          $push: { userId: userId },
        })
      }
    }

    const finalAmount = totalAmount - discount + DELIVERY_CHARGE
    const discountedItems = distributeDiscount(
      user.cart.map((item) => ({
        product: item.productId._id,
        productName: item.productId.productName,
        productImages: item.productId.productImage,
        quantity: item.quantity,
        price: item.productId.salePrice,
      })),
      discount,
    )

    const orders = await Promise.all(
      discountedItems.map(async (item) => {
        const product = await Product.findById(item.product).select("regularPrice productName productImage")
        const order = new Order({
          userId: userId,
          orderedItems: [
            {
              product: item.product,
              productName: product.productName,
              productImages: product.productImage,
              quantity: item.quantity,
              price: item.discountedPrice,
              regularPrice: product.regularPrice,
              status: "confirmed",
            },
          ],
          totalPrice: item.price * item.quantity,
          discount: item.price * item.quantity - item.discountedPrice * item.quantity,
          finalAmount: item.discountedPrice * item.quantity + DELIVERY_CHARGE / discountedItems.length,
          address: selectedAddress,
          status: "confirmed",
          paymentStatus: "Success",
          paymentMethod: "wallet",
          couponApplied: couponApplied,
          deliveryCharge: DELIVERY_CHARGE / discountedItems.length,
          createdOn: new Date(),
          updatedOn: new Date(), // Set initial updatedOn timestamp
        })

        await Product.findByIdAndUpdate(item.product, {
          $inc: { quantity: -item.quantity },
        })

        return order.save()
      }),
    )

    //rest of the code is same as placeOrder function.
    const wallet = await Wallet.findOne({ userId })

    if (!wallet || wallet.balance < finalAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      })
    }

    wallet.balance -= finalAmount
    wallet.totalDebited += finalAmount
    wallet.transactions.push({
      amount: finalAmount,
      transactionType: "debit",
      transactionPurpose: "purchase",
      description: "Order payment from wallet",
    })

    await wallet.save()

    await Transaction.create({
      userId: userId,
      amount: finalAmount,
      transactionType: "debit",
      paymentMethod: "wallet",
      paymentGateway: "wallet",
      status: "completed",
      purpose: "purchase",
      description: "Order payment from wallet",
      orders: orders.map((order) => ({
        orderId: order.orderId,
        amount: order.finalAmount,
      })),
      walletBalanceAfter: wallet.balance,
    })

    // Clear cart
    await User.findByIdAndUpdate(userId, { $set: { cart: [] } })

    res.json({
      success: true,
      orderIds: orders.map((order) => order.orderId),
      message: "Orders placed successfully",
    })
  } catch (error) {
    logger.error("Error in placeWalletOrder:", error)
    res.status(500).json({
      success: false,
      message: "Failed to place order",
    })
  }
}

export {
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
  generateInvoice,
  repayOrder,
  loadPaymentSuccess,
  loadPaymentFailed,
  paymentFailure
};

export default {
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
  generateInvoice,
  repayOrder,
  loadPaymentSuccess,
  loadPaymentFailed,
  paymentFailure
}
