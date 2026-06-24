import logger from '../../utils/logger.js';
import User from '../../models/userSchema.js';
import Product from '../../models/productSchema.js';
import Order from '../../models/orderSchema.js';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';


import STATUS_CODES from '../../enums/statusCodes.js';
import MESSAGES from '../../enums/constants.js';

import ORDER_STATUS from '../../enums/orderStatus.js';
import PAYMENT_STATUS from '../../enums/paymentStatus.js';

const pageError = async (req, res) => {
    res.render('admin-error')
}


const loadLogin = (req, res) => {
    if(req.session.admin){
        return res.redirect('/admin')
    }
    res.render('admin-login', { message: null, successMessage: null })
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ isAdmin: true, email: email });

        if (admin) {
            const passwordMatch = await bcrypt.compare(password, admin.password);
            if (passwordMatch) {
                
                req.session.admin = admin._id;
                return res.render('admin-login', { message: null, successMessage: 'Login successful' });
            } else {
                return res.render('admin-login', { message: 'Invalid credentials', successMessage: null });
            }
        } else {
            return res.render('admin-login', { message: 'Invalid credentials', successMessage: null });
        }
    } catch (error) {
        logger.error(MESSAGES.LOGIN_ERROR, error);
        return res.render('admin-login', { message: 'An error occurred during login', successMessage: null });
    }
};


const loadDashboard = async (req, res) => {
  if (req.session.admin) {
    try {
      const productCount = await Product.countDocuments()
      const userCount = await User.countDocuments({ isAdmin: false })
      const orderCount = await Order.countDocuments()

      const orders = await Order.find({ status: ORDER_STATUS.DELIVERED })
      const totalRevenue = orders.reduce((total, order) => total + order.finalAmount, 0)

      const topProducts = await getTopSellingProducts()

      const recentOrders = await getRecentOrders()

      const salesData = await getSalesDataHelper("monthly")

      const orderStatusCounts = await getOrderStatusCounts()

      const dashboardData = {
        productCount,
        userCount,
        orderCount,
        totalRevenue,
        topProducts,
        recentOrders,
        salesData: salesData.data,
        salesLabels: salesData.labels,
        orderStatusData: Object.values(orderStatusCounts),
        orderStatusLabels: Object.keys(orderStatusCounts),
      }

      res.render("dashboard", { dashboardData })
    } catch (error) {
      logger.error(MESSAGES.DASHBOARD_ERROR, error)
      res.redirect("/pageerror")
    }
  } else {
    return res.redirect("/admin/login")
  }
}

const getTopSellingProducts = async (limit = 5) => {
  try {
    const topProducts = await Order.aggregate([
      { $match: { status: ORDER_STATUS.DELIVERED } },
      { $unwind: "$orderedItems" },
      {
        $group: {
          _id: "$orderedItems.product",
          name: { $first: "$orderedItems.productName" },
          soldCount: { $sum: "$orderedItems.quantity" },
          totalSales: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } },
        },
      },
      { $sort: { soldCount: -1 } },
      { $limit: limit },
    ])

 
    const enrichedProducts = await Promise.all(
      topProducts.map(async (product) => {
        const productDetails = await Product.findById(product._id).populate("category")
        return {
          _id: product._id,
          name: product.name,
          category: productDetails?.category?.name || "Uncategorized",
          price: productDetails?.salePrice || 0,
          image: productDetails?.productImage?.[0] || null,
          soldCount: product.soldCount,
        }
      }),
    )

    return enrichedProducts
  } catch (error) {
    logger.error(MESSAGES.ERROR_GETTING_TOP_PRODUCTS, error)
    return []
  }
}


const getRecentOrders = async (limit = 5) => {
  try {
    const recentOrders = await Order.find().sort({ createdOn: -1 }).limit(limit)

    
    const ordersWithCustomers = await Promise.all(
      recentOrders.map(async (order) => {
        const customer = await User.findById(order.userId)
        return {
          ...order.toObject(),
          customerName: customer ? `${customer.name} ${customer.email}` : "Unknown",
        }
      }),
    )

    return ordersWithCustomers
  } catch (error) {
    logger.error(MESSAGES.ERROR_GETTING_RECENT_ORDERS, error)
    return []
  }
}


const getSalesDataHelper = async (period = "yearly") => {
  try {
    const now = new Date()
    const labels = []
    const data = []

    if (period === "weekly") {
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)

        const dayStart = new Date(date.setHours(0, 0, 0, 0))
        const dayEnd = new Date(date.setHours(23, 59, 59, 999))

        const dayOrders = await Order.find({
          createdOn: { $gte: dayStart, $lte: dayEnd },
          status: ORDER_STATUS.DELIVERED,
        })

        const daySales = dayOrders.reduce((total, order) => total + order.finalAmount, 0)

        labels.push(date.toLocaleDateString("en-US", { weekday: "short" }))
        data.push(daySales)
      }
    } else if (period === "monthly") {
      
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now)
        date.setMonth(date.getMonth() - i)

        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1)
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)

        const monthOrders = await Order.find({
          createdOn: { $gte: monthStart, $lte: monthEnd },
          status: ORDER_STATUS.DELIVERED,
        })

        const monthSales = monthOrders.reduce((total, order) => total + order.finalAmount, 0)

        labels.push(date.toLocaleDateString("en-US", { month: "short" }))
        data.push(monthSales)
      }
    } else if (period === "yearly") {
      
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i

        const yearStart = new Date(year, 0, 1)
        const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

        const yearOrders = await Order.find({
          createdOn: { $gte: yearStart, $lte: yearEnd },
          status: ORDER_STATUS.DELIVERED,
        })

        const yearSales = yearOrders.reduce((total, order) => total + order.finalAmount, 0)

        labels.push(year.toString())
        data.push(yearSales)
      }
    }

    return { labels, data }
  } catch (error) {
    logger.error(MESSAGES.ERROR_GETTING_SALES_DATA, error)
    return { labels: [], data: [] }
  }
}


const getOrderStatusCounts = async () => {
  try {
    const statusCounts = {
      Delivered: 0,
      Pending: 0,
      Shipped: 0,
      Cancelled: 0,
      Returned: 0,
    }

    const orders = await Order.find()

    orders.forEach((order) => {
      if (order.status === ORDER_STATUS.DELIVERED) statusCounts["Delivered"]++
      else if (order.status === ORDER_STATUS.PENDING) statusCounts[PAYMENT_STATUS.PENDING]++
      else if (order.status === ORDER_STATUS.SHIPPED) statusCounts["Shipped"]++
      else if (order.status === ORDER_STATUS.CANCELLED) statusCounts["Cancelled"]++
      else if (order.status.includes("return")) statusCounts["Returned"]++
    })

    return statusCounts
  } catch (error) {
    logger.error(MESSAGES.ERROR_GETTING_ORDER_STATUS_COUNTS, error)
    return { Delivered: 0, Pending: 0, Shipped: 0, Cancelled: 0, Returned: 0 }
  }
}



const logout = async (req, res) => {
    try {
        if (req.session.admin) {
            delete req.session.admin; 
        }
        res.redirect('/admin/login'); 
    } catch (error) {
        logger.info(MESSAGES.LOGOUT_ERROR, error);
        res.redirect('/pageerror');
    }
};

const getTopSelling = async (req, res) => {
  try {
    const { type } = req.query

    if (type === "categories") {
      
      const topCategories = await Order.aggregate([
        { $match: { status: ORDER_STATUS.DELIVERED } },
        { $unwind: "$orderedItems" },
        {
          $lookup: {
            from: "products",
            localField: "orderedItems.product",
            foreignField: "_id",
            as: "productDetails",
          },
        },
        { $unwind: "$productDetails" },
        {
          $lookup: {
            from: "categories",
            localField: "productDetails.category",
            foreignField: "_id",
            as: "categoryDetails",
          },
        },
        { $unwind: "$categoryDetails" },
        {
          $group: {
            _id: "$categoryDetails._id",
            name: { $first: "$categoryDetails.name" },
            productCount: { $addToSet: "$productDetails._id" },
            soldCount: { $sum: "$orderedItems.quantity" },
            totalSales: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } },
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            productCount: { $size: "$productCount" },
            soldCount: 1,
            totalSales: 1,
          },
        },
        { $sort: { soldCount: -1 } },
        { $limit: 10 },
      ])

      res.json({ categories: topCategories })
    } else {
     
      const topProducts = await Order.aggregate([
        { $match: { status: ORDER_STATUS.DELIVERED } },
        { $unwind: "$orderedItems" },
        {
          $group: {
            _id: "$orderedItems.product",
            name: { $first: "$orderedItems.productName" },
            soldCount: { $sum: "$orderedItems.quantity" },
            totalSales: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } },
          },
        },
        { $sort: { soldCount: -1 } },
        { $limit: 10 },
      ])

     
      const enrichedProducts = await Promise.all(
        topProducts.map(async (product) => {
          const productDetails = await Product.findById(product._id).populate("category")
          return {
            _id: product._id,
            name: product.name,
            category: productDetails?.category?.name || "Uncategorized",
            price: productDetails?.salePrice || 0,
            image: productDetails?.productImage?.[0] || null,
            soldCount: product.soldCount,
          }
        }),
      )

      res.json({ products: enrichedProducts })
    }
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_GETTOPSELLING_API, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" })
  }
}

const getSalesData = async (req, res) => {
  try {
    const { period = "monthly" } = req.query

    const salesData = await getSalesDataHelper(period)
    res.json(salesData)
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_GETSALESDATA_API, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" })
  }
}





export default {
    loadLogin,
    login,
    loadDashboard,
    pageError,
    logout,
    getTopSelling,
    getSalesData,
}