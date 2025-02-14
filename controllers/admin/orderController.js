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
        const { orderId, itemId, status } = req.body;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (itemId) {
            // Update specific item status
            const item = order.orderedItems.id(itemId);
            if (!item) {
                return res.status(404).json({ success: false, message: "Order item not found" });
            }
            
            // Check if the item is already cancelled or returned
            if (item.status === 'cancelled' || item.status === 'returned') {
                return res.status(400).json({ success: false, message: "Cannot change status of cancelled or returned items" });
            }

            // Check if the order is delivered and the new status is not 'returning' or 'returned'
            if (item.status === 'delivered' && !['returning', 'returned'].includes(status)) {
                return res.status(400).json({ success: false, message: "Cannot change status of delivered items unless returning or returned" });
            }

            item.status = status;
        } else {
            // Update entire order status
            // Don't change status of cancelled or returned items
            order.orderedItems.forEach(item => {
                if (item.status !== 'cancelled' && item.status !== 'returned') {
                    item.status = status;
                }
            });
            order.status = status;
        }

        await order.save();
        res.json({ success: true, message: "Order status updated successfully" });
    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const handleCancelRequest = async (req, res) => {
    try {
        const { orderId, itemId, approved, message } = req.body;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const item = order.orderedItems.id(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found" });
        }

        item.requestStatus = approved ? 'approved' : 'rejected';
        item.adminMessage = message;

        if (approved) {
            item.status = 'cancelled';
            // Process refund for single item
            const user = await User.findById(order.userId);
            if (user) {
                user.wallet += item.price * item.quantity;
                await user.save();
            }

            // Update product quantity
            const product = await Product.findById(item.product);
            if (product) {
                product.quantity += item.quantity;
                await product.save();
            }
        }

        // Check if all items are cancelled
        const allCancelled = order.orderedItems.every(item => item.status === 'cancelled');
        if (allCancelled) {
            order.status = 'cancelled';
        }

        await order.save();
        res.json({ success: true, message: "Cancel request processed successfully" });
    } catch (error) {
        console.error("Error processing cancel request:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const handleReturnRequest = async (req, res) => {
    try {
        const { orderId, itemId, approved, message } = req.body;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const item = order.orderedItems.id(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found" });
        }

        item.requestStatus = approved ? 'approved' : 'rejected';
        item.adminMessage = message;

        if (approved) {
            item.status = 'returning';
        } else {
            item.status = 'delivered'; // If rejected, set back to delivered
        }

        // Check if all items are returned or returning
        const allReturned = order.orderedItems.every(item => ['returned', 'returning'].includes(item.status));
        if (allReturned) {
            order.status = 'returning';
        }

        await order.save();
        res.json({ success: true, message: "Return request processed successfully" });
    } catch (error) {
        console.error("Error processing return request:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const confirmReturn = async (req, res) => {
    try {
        const { orderId, itemId } = req.body;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const item = order.orderedItems.id(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found" });
        }

        item.status = 'returned';
        
        // Process refund for single item
        const user = await User.findById(order.userId);
        if (user) {
            user.wallet += item.price * item.quantity;
            await user.save();
        }

        // Update product quantity
        const product = await Product.findById(item.product);
        if (product) {
            product.quantity += item.quantity;
            await product.save();
        }

        // Check if all items are returned
        const allReturned = order.orderedItems.every(item => item.status === 'returned');
        if (allReturned) {
            order.status = 'returned';
        }

        await order.save();
        res.json({ success: true, message: "Return completed successfully" });
    } catch (error) {
        console.error("Error confirming return:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

module.exports = {
    getOrders,
    getOrderDetails,
    updateOrderStatus,
    handleCancelRequest,
    handleReturnRequest,
    confirmReturn
};