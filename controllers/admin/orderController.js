import logger from '../../utils/logger.js';
import Order from "../../models/orderSchema.js";
import User from "../../models/userSchema.js";
import Product from "../../models/productSchema.js";
import { processRefund } from "../user/orderController.js";

import STATUS_CODES from '../../enums/statusCodes.js';
import MESSAGES from '../../enums/constants.js';

import ORDER_STATUS from '../../enums/orderStatus.js';

const getOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdOn: -1 })

    res.render("admin-orders", {
      orders,
      title: "Order Management",
    })
  } catch (error) {
    logger.error(MESSAGES.ERROR_FETCHING_ORDERS, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send(MESSAGES.INTERNAL_SERVER_ERROR)
  }
}

const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id
    const order = await Order.findById(orderId)

    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).send(MESSAGES.ORDER_NOT_FOUND)
    }

    res.render("admin-order-details", {
      order,
      title: "Order Details",
    })
  } catch (error) {
    logger.error(MESSAGES.ERROR_FETCHING_ORDER_DETAILS, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send(MESSAGES.INTERNAL_SERVER_ERROR)
  }
}

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body
    const order = await Order.findById(orderId)

    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER_NOT_FOUND })
    }

    if (order.status === ORDER_STATUS.CANCELLED) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.CANNOT_UPDATE_CANCELLED_ORDER })
    }

    const statuses = [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED, ORDER_STATUS.SHIPPED, ORDER_STATUS.DELIVERED];
    const currentIndex = statuses.indexOf(order.status);
    const newIndex = statuses.indexOf(status);

    if (newIndex !== -1 && currentIndex !== -1 && newIndex < currentIndex) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.CANNOT_REVERT_ORDER_TO_A_PREVIOUS_STATUS })
    }

    order.status = status
    order.orderedItems[0].status = status

    order.updatedOn = new Date()

    if (status === ORDER_STATUS.DELIVERED) {
      order.deliveredOn = new Date()
    }

    await order.save()
    res.json({ success: true, message: MESSAGES.ORDER_STATUS_UPDATED_SUCCESSFULLY })
  } catch (error) {
    logger.error(MESSAGES.ERROR_UPDATING_ORDER_STATUS, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.INTERNAL_SERVER_ERROR_1 })
  }
}

const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body
    const order = await Order.findById(orderId)

    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER_NOT_FOUND })
    }

    if (order.status !== ORDER_STATUS.CANCELLED && order.status !== ORDER_STATUS.DELIVERED) {
      order.status = ORDER_STATUS.CANCELLED
      order.orderedItems[0].status = ORDER_STATUS.CANCELLED

      order.updatedOn = new Date()

      await Product.findByIdAndUpdate(order.orderedItems[0].product, {
        $inc: { quantity: order.orderedItems[0].quantity },
      })

      if (order.paymentMethod === "online" || order.paymentMethod === "wallet") {
        const refundSuccess = await processRefund(order.userId, order)
        if (!refundSuccess) {
          return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGES.FAILED_TO_PROCESS_REFUND,
          })
        }
      }

      await order.save()
      res.json({ success: true, message: MESSAGES.ORDER_CANCELLED_AND_REFUND_PROCESSED_SUCCESSFULLY })
    } else {
      res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.ORDER_CANNOT_BE_CANCELLED })
    }
  } catch (error) {
    logger.error(MESSAGES.ERROR_CANCELLING_ORDER, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.INTERNAL_SERVER_ERROR_1 })
  }
}

const handleReturnRequest = async (req, res) => {
  try {
    const { orderId, action, message, category } = req.body
    const order = await Order.findById(orderId)

    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).json({
        success: false,
        message: MESSAGES.ORDER_NOT_FOUND,
      })
    }

    if (action === "approve") {
      order.status = ORDER_STATUS.RETURNING
      order.requestStatus = "approved"
    } else if (action === "reject") {
      order.status = ORDER_STATUS.DELIVERED
      order.requestStatus = "rejected"
      order.rejectionCategory = category
      order.rejectionReason = message
    }

    order.updatedOn = new Date()

    await order.save()
    res.json({
      success: true,
      message: `Return request ${action}d successfully`,
    })
  } catch (error) {
    logger.error(MESSAGES.ERROR_HANDLING_RETURN_REQUEST, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR_1,
    })
  }
}

const updateReturnStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body
    const order = await Order.findById(orderId)

    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).json({
        success: false,
        message: MESSAGES.ORDER_NOT_FOUND,
      })
    }

    if (order.status !== ORDER_STATUS.RETURNING && status === ORDER_STATUS.RETURNED) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.ORDER_MUST_BE_IN_RETURNING_STATUS_FIRST,
      })
    }

    order.status = status
    
    order.updatedOn = new Date()

    if (status === ORDER_STATUS.RETURNED) {
      const refundSuccess = await processRefund(order.userId, order)
      if (!refundSuccess) {
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: MESSAGES.FAILED_TO_PROCESS_REFUND,
        })
      }
    }

    await order.save()
    res.json({
      success: true,
      message: MESSAGES.RETURN_STATUS_UPDATED_SUCCESSFULLY,
    })
  } catch (error) {
    logger.error(MESSAGES.ERROR_UPDATING_RETURN_STATUS, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR_1,
    })
  }
}

export default {
  getOrders,
  getOrderDetails,
  updateOrderStatus,
  cancelOrder,
  handleReturnRequest,
  updateReturnStatus,
}
