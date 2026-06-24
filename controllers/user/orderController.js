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

import STATUS_CODES from '../../enums/statusCodes.js';
import MESSAGES from '../../enums/constants.js';

import ORDER_STATUS from '../../enums/orderStatus.js';
import PAYMENT_STATUS from '../../enums/paymentStatus.js';
import TRANSACTION_STATUS from '../../enums/transactionStatus.js';

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
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.CART_IS_EMPTY,
      })
    }

    const address = await Address.findOne({ userId: userId, "address._id": addressId })
    if (!address) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.ADDRESS_NOT_FOUND,
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
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.COD_NOT_AVAILABLE_FOR_ORDERS_ABOVE_35_000,
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
              status: ORDER_STATUS.PENDING,
            },
          ],
          totalPrice: item.price * item.quantity,
          discount: item.price * item.quantity - item.discountedPrice * item.quantity,
          finalAmount: item.discountedPrice * item.quantity + DELIVERY_CHARGE / discountedItems.length,
          address: selectedAddress,
          status: (paymentMethod === "cod" || paymentMethod === "wallet") ? ORDER_STATUS.CONFIRMED : ORDER_STATUS.PENDING,
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
        return res.status(STATUS_CODES.BAD_REQUEST).json({
          success: false,
          message: MESSAGES.INSUFFICIENT_WALLET_BALANCE,
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
        status: TRANSACTION_STATUS.COMPLETED,
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
      message: MESSAGES.ORDERS_PLACED_SUCCESSFULLY,
    })
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_PLACEORDER, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.FAILED_TO_PLACE_ORDER,
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
    logger.error(MESSAGES.ERROR_IN_GETORDERS, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" })
  }
}

const loadOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user
    const orderId = req.query.orderId

    const order = await Order.findOne({ orderId: orderId, userId })
    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).send(MESSAGES.ORDER_NOT_FOUND)
    }

    const user = await User.findById(userId)

    res.render("order-details", {
      order,
      user,
    })
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_LOADORDERDETAILS, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send(MESSAGES.INTERNAL_SERVER_ERROR_1)
  }
}

const cancelOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body
    const userId = req.session.user

    const order = await Order.findOne({ _id: orderId, userId })
    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER_NOT_FOUND })
    }

    if (order.status !== ORDER_STATUS.CANCELLED && order.status !== ORDER_STATUS.DELIVERED) {
      order.status = ORDER_STATUS.CANCELLED
      order.cancelReason = reason
      order.orderedItems[0].status = ORDER_STATUS.CANCELLED
      order.orderedItems[0].cancelReason = reason

      // Update the timestamp when user cancels the order
      order.updatedOn = new Date()

      await Product.findByIdAndUpdate(order.orderedItems[0].product, {
        $inc: { quantity: order.orderedItems[0].quantity },
      })

      const isOnlineSuccess = order.paymentMethod === "online" && order.paymentStatus === PAYMENT_STATUS.SUCCESS;
      const isWallet = order.paymentMethod === "wallet";

      if (isOnlineSuccess || isWallet) {
        const refundSuccess = await processRefund(userId, order)
        if (!refundSuccess) {
          return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGES.FAILED_TO_PROCESS_REFUND,
          })
        }
      }

      await order.save()
      res.json({ success: true, message: MESSAGES.ORDER_CANCELLED_SUCCESSFULLY })
    } else {
      res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.ORDER_CANNOT_BE_CANCELLED })
    }
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_CANCELORDER, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.INTERNAL_SERVER_ERROR_1 })
  }
}

const requestReturn = async (req, res) => {
  try {
    const { orderId, returnReason, returnDescription } = req.body
    const userId = req.session.user
    const files = req.files

    const order = await Order.findOne({ _id: orderId, userId })
    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER_NOT_FOUND })
    }

    const deliveryDate = new Date(order.updatedAt)
    const currentDate = new Date()
    const daysSinceDelivery = Math.floor((currentDate - deliveryDate) / (1000 * 60 * 60 * 24))

    if (order.status !== ORDER_STATUS.DELIVERED || daysSinceDelivery > 7) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.ORDER_IS_NOT_ELIGIBLE_FOR_RETURN,
      })
    }

    let imagePaths = []
    if (files && files.length > 0) {
      imagePaths = files.map((file) => `uploads/returns/${file.filename}`)
    }

    order.status = ORDER_STATUS.RETURN_REQUESTED
    order.returnReason = returnReason
    order.returnDescription = returnDescription
    order.returnImages = imagePaths
    order.requestStatus = ORDER_STATUS.PENDING

    // Update the timestamp when return is requested
    order.updatedOn = new Date()

    await order.save()

    res.json({
      success: true,
      message: MESSAGES.RETURN_REQUEST_SUBMITTED_SUCCESSFULLY,
    })
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_REQUESTRETURN, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR_1,
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
      description: `Refund for ${order.status === ORDER_STATUS.CANCELLED ? ORDER_STATUS.CANCELLED : ORDER_STATUS.RETURNED} order #${order.orderId}`,
    })

    await wallet.save()

    await Transaction.create({
      userId: userId,
      amount: refundAmount,
      transactionType: "credit",
      paymentMethod: "refund",
      paymentGateway: order.paymentMethod === "online" ? "razorpay" : "wallet",
      status: TRANSACTION_STATUS.COMPLETED,
      purpose: order.status === ORDER_STATUS.CANCELLED ? "cancellation" : "return",
      description: `Refund for ${order.status === ORDER_STATUS.CANCELLED ? ORDER_STATUS.CANCELLED : ORDER_STATUS.RETURNED} order #${order.orderId}`,
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
    logger.error(MESSAGES.ERROR_PROCESSING_REFUND, error)
    return false
  }
}

const cancelReturnRequest = async (req, res) => {
  try {
    const { orderId } = req.body
    const userId = req.session.user

    const order = await Order.findOne({ _id: orderId, userId })
    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER_NOT_FOUND })
    }

    if (order.status !== ORDER_STATUS.RETURN_REQUESTED || order.requestStatus !== ORDER_STATUS.PENDING) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.RETURN_REQUEST_CANNOT_BE_CANCELLED,
      })
    }

    order.status = ORDER_STATUS.DELIVERED
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
      message: MESSAGES.RETURN_REQUEST_CANCELLED_SUCCESSFULLY,
    })
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_CANCELRETURNREQUEST, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR_1,
    })
  }
}

const generateInvoice = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.query.orderId;

    const order = await Order.findOne({ orderId: orderId, userId });
    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).send(MESSAGES.ORDER_NOT_FOUND);
    }

    if (order.status !== ORDER_STATUS.DELIVERED) {
      return res.status(STATUS_CODES.BAD_REQUEST).send("Invoice is only available for delivered orders");
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
          logger.error(MESSAGES.ERROR_SENDING_FILE, err);
          res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Error generating invoice");
        }
        
        
        fs.unlink(filePath, (err) => {
          if (err) logger.error(MESSAGES.ERROR_DELETING_TEMPORARY_FILE, err);
        });
      });
    });

  } catch (error) {
    logger.error(MESSAGES.ERROR_GENERATING_INVOICE, error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Error generating invoice");
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
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.CART_IS_EMPTY,
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
    logger.error(MESSAGES.ERROR_IN_CREATERAZORPAYORDER, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.FAILED_TO_CREATE_ORDER,
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
        { $set: { paymentStatus: PAYMENT_STATUS.FAILED } }
      )
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.INVALID_PAYMENT_SIGNATURE,
      })
    }

    const orders = await Order.find({ _id: { $in: dbOrderIds } });
    if (!orders || orders.length === 0) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.ORDERS_NOT_FOUND });
    }

    // Update orders to confirmed and paymentStatus to Success
    for (const order of orders) {
      const wasCancelled = order.status === ORDER_STATUS.CANCELLED;

      order.status = ORDER_STATUS.CONFIRMED;
      order.paymentStatus = PAYMENT_STATUS.SUCCESS;
      order.orderedItems[0].status = ORDER_STATUS.CONFIRMED;

      if (wasCancelled) {
        await Product.findByIdAndUpdate(order.orderedItems[0].product, {
          $inc: { quantity: -order.orderedItems[0].quantity }
        });
      }

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
        status: TRANSACTION_STATUS.COMPLETED,
        purpose: "purchase",
        description: "Online payment for order",
        orders: orders.map((order) => ({
          orderId: order.orderId,
          amount: order.finalAmount,
        })),
      })
    } catch (txnError) {
      logger.error(MESSAGES.ERROR_CREATING_TRANSACTION_RECORD, txnError);
    }

    res.json({
      success: true,
      orderIds: orders.map(o => o.orderId),
      message: MESSAGES.PAYMENT_VERIFIED_SUCCESSFULLY
    })
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_VERIFYPAYMENT, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.PAYMENT_VERIFICATION_FAILED,
    })
  }
}

const paymentFailure = async (req, res) => {
  try {
      const { dbOrderIds } = req.body;
      const userId = req.session.user;
      
      if (dbOrderIds && dbOrderIds.length > 0) {
        const orders = await Order.find({ _id: { $in: dbOrderIds } });
        
        for (const order of orders) {
           order.paymentStatus = PAYMENT_STATUS.FAILED;
           order.status = ORDER_STATUS.PENDING;
           order.orderedItems[0].status = ORDER_STATUS.PENDING;
           
           await order.save();
        }
      }
      res.json({ success: true, message: MESSAGES.UPDATED_PAYMENT_STATUS_TO_FAILED });
  } catch (error) {
      logger.error(MESSAGES.ERROR_IN_PAYMENTFAILURE, error);
      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.INTERNAL_SERVER_ERROR_1 });
  }
}

const repayOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ _id: orderId, userId: userId });
    
    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER_NOT_FOUND });
    }

    if (order.status !== ORDER_STATUS.PENDING) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.ORDER_CANNOT_BE_REPAID });
    }

    const timePassedMs = Date.now() - new Date(order.createdOn).getTime();
    if (timePassedMs > 15 * 60 * 1000) {
      // Past 15 minutes
      // Let's cancel the order to free stock
      order.status = ORDER_STATUS.CANCELLED;
      order.cancelReason = "Payment timeout";
      order.orderedItems[0].status = ORDER_STATUS.CANCELLED;
      await order.save();
      
      // return stock
      await Product.findByIdAndUpdate(order.orderedItems[0].product, {
        $inc: { quantity: order.orderedItems[0].quantity },
      })
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.PAYMENT_TIME_LIMIT_EXCEEDED_15_MINS_ORDER_CANCELLE });
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
    logger.error(MESSAGES.ERROR_IN_REPAYORDER, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.FAILED_TO_INITIATE_PAYMENT,
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
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.CART_IS_EMPTY,
      })
    }

    const address = await Address.findOne({ userId: userId, "address._id": addressId })
    if (!address) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.ADDRESS_NOT_FOUND,
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
              status: ORDER_STATUS.CONFIRMED,
            },
          ],
          totalPrice: item.price * item.quantity,
          discount: item.price * item.quantity - item.discountedPrice * item.quantity,
          finalAmount: item.discountedPrice * item.quantity + DELIVERY_CHARGE / discountedItems.length,
          address: selectedAddress,
          status: ORDER_STATUS.CONFIRMED,
          paymentStatus: PAYMENT_STATUS.SUCCESS,
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
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.INSUFFICIENT_WALLET_BALANCE,
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
      status: TRANSACTION_STATUS.COMPLETED,
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
      message: MESSAGES.ORDERS_PLACED_SUCCESSFULLY,
    })
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_PLACEWALLETORDER, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.FAILED_TO_PLACE_ORDER,
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
