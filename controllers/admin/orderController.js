const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const processRefund = require("../user/orderController").processRefund;

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


const handleReturnRequest = async (req, res) => {
    try {
        const { orderId, action, message, category } = req.body;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: "Order not found" 
            });
        }

        if (action === 'approve') {
            order.status = 'returning';
            order.requestStatus = 'approved';
            order.orderedItems[0].status = 'returning';
            order.orderedItems[0].requestStatus = 'approved';
        } else if (action === 'reject') {
            order.status = 'delivered';
            order.requestStatus = 'rejected';
            order.rejectionCategory = category;
            order.rejectionReason = message;
            order.orderedItems[0].status = 'delivered';
            order.orderedItems[0].requestStatus = 'rejected';
            order.orderedItems[0].rejectionCategory = category;
            order.orderedItems[0].rejectionReason = message;
        }

        await order.save();
        res.json({ 
            success: true, 
            message: `Return request ${action}ed successfully` 
        });

    } catch (error) {
        console.error("Error handling return request:", error);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error" 
        });
    }
};

const updateReturnStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: "Order not found" 
            });
        }

        if (order.status !== 'returning' && status === 'returned') {
            return res.status(400).json({ 
                success: false, 
                message: "Order must be in returning status first" 
            });
        }

        order.status = status;
        order.orderedItems[0].status = status;

        // If status is 'returned', process the refund
        if (status === 'returned') {
            const refundSuccess = await processRefund(order.userId, order);
            if (!refundSuccess) {
                return res.status(500).json({ 
                    success: false, 
                    message: "Failed to process refund" 
                });
            }
        }

        await order.save();
        res.json({ 
            success: true, 
            message: "Return status updated successfully" 
        });

    } catch (error) {
        console.error("Error updating return status:", error);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error" 
        });
    }
};



module.exports = {
    getOrders,
    getOrderDetails,
    updateOrderStatus,
    cancelOrder,
    handleReturnRequest,
    updateReturnStatus,


};