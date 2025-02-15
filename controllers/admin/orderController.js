const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");

const getOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate({
                path: "orderedItems.product",
                select: "productName productImage price quantity",
            })
            .sort({ createdOn: -1 });

        res.render("admin-orders", {
            orders,
            title: "Order Management",
        });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).send("Internal Server Error");
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId)
            .populate({
                path: "orderedItems.product",
                select: "productName productImage price quantity",
            });

        if (!order) {
            return res.status(404).send("Order not found");
        }

        res.render("admin-order-details", {
            order,
            title: "Order Details",
        });
    } catch (error) {
        console.error("Error fetching order details:", error);
        res.status(500).send("Internal Server Error");
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // Don't allow status change if order is cancelled
        if (order.status === 'cancelled') {
            return res.status(400).json({ success: false, message: "Cannot update cancelled order" });
        }

        // Update order status
        order.status = status;
        order.orderedItems[0].status = status;

        await order.save();
        res.json({ success: true, message: "Order status updated successfully" });
    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (order.status !== 'cancelled' && order.status !== 'delivered') {
            order.status = 'cancelled';
            order.orderedItems[0].status = 'cancelled';

            // Return product quantity to stock
            await Product.findByIdAndUpdate(order.orderedItems[0].product, {
                $inc: { quantity: order.orderedItems[0].quantity }
            });

            await order.save();
            res.json({ success: true, message: "Order cancelled successfully" });
        } else {
            res.status(400).json({ success: false, message: "Order cannot be cancelled" });
        }
    } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

module.exports = {
    getOrders,
    getOrderDetails,
    updateOrderStatus,
    cancelOrder
};