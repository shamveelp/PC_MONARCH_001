const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema")

const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        const { addressId } = req.body;

        // Get user and cart items
        const user = await User.findById(userId).populate({
            path: 'cart.productId',
            model: 'Product'
        });

        if (!user || user.cart.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // Get address details
        const address = await Address.findOne({ userId: userId, 'address._id': addressId });
        if (!address) {
            return res.status(400).json({
                success: false,
                message: 'Address not found'
            });
        }

        const selectedAddress = address.address.find(addr => addr._id.toString() === addressId);

        // Calculate totals
        const orderedItems = user.cart.map(item => ({
            product: item.productId._id,
            quantity: item.quantity,
            price: item.productId.salePrice,
            status: 'pending'
        }));

        const totalPrice = user.cart.reduce((total, item) => 
            total + (item.productId.salePrice * item.quantity), 0);

        // Create new order
        const newOrder = new Order({
            userId: userId,
            orderedItems,
            totalPrice,
            finalAmount: totalPrice,
            address: selectedAddress,
            status: 'pending',
            createdOn: new Date()
        });

        // Update product quantities and save order
        await Promise.all([
            ...user.cart.map(item => 
                Product.findByIdAndUpdate(item.productId._id, {
                    $inc: { quantity: -item.quantity }
                })
            ),
            newOrder.save(),
            User.findByIdAndUpdate(userId, { $set: { cart: [] } })
        ]);

        res.json({
            success: true,
            orderId: newOrder.orderId,
            message: 'Order placed successfully'
        });

    } catch (error) {
        console.error('Error in placeOrder:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to place order'
        });
    }
};

const getOrders = async (req, res) => {
    try {
        const userId = req.session.user;
        
        const orders = await Order.find({ userId })
            .populate({
                path: 'orderedItems.product',
                select: 'productName productImage price'
            })
            .sort({ createdOn: -1 });

        const user = await User.findById(userId);

        res.render("orders", {
            orders: orders,
            user: user
        });
    } catch (error) {
        console.error("Error in getOrders:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

const loadOrderDetails = async (req, res) => {
    try {
        const userId = req.session.user;
        const orderId = req.query.orderId;

        const order = await Order.findOne({ orderId: orderId, userId })
            .populate({
                path: 'orderedItems.product',
                select: 'productName productImage price'
            });

        if (!order) {
            return res.status(404).send('Order not found');
        }

        const user = await User.findById(userId);

        res.render("order-details", {
            order,
            user
        });
    } catch (error) {
        console.error("Error in loadOrderDetails:", error);
        res.status(500).send("Internal server error");
    }
};

const cancelOrder = async (req, res) => {
    try {
        const { orderId, itemId, reason } = req.body;
        const userId = req.session.user;

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (itemId) {
            // Cancel specific item
            const item = order.orderedItems.id(itemId);
            if (!item) {
                return res.status(404).json({ success: false, message: 'Item not found' });
            }
            if (item.status !== 'cancelled' && item.status !== 'returned') {
                item.status = 'cancelled';
                item.cancelReason = reason;
                item.requestStatus = 'pending';
            }
        } else {
            // Cancel entire order
            order.status = 'cancelled';
            order.cancelReason = reason;
            order.requestStatus = 'pending';
            order.orderedItems.forEach(item => {
                if (item.status !== 'cancelled' && item.status !== 'returned') {
                    item.status = 'cancelled';
                    item.cancelReason = reason;
                    item.requestStatus = 'pending';
                }
            });
        }

        await order.save();
        res.json({ success: true, message: 'Cancellation request submitted successfully' });

    } catch (error) {
        console.error('Error in cancelOrder:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const returnOrder = async (req, res) => {
    try {
        const { orderId, itemId, reason } = req.body;
        const userId = req.session.user;

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (itemId) {
            // Return specific item
            const item = order.orderedItems.id(itemId);
            if (!item) {
                return res.status(404).json({ success: false, message: 'Item not found' });
            }
            if (item.status === 'delivered') {
                item.status = 'return_requested';
                item.returnReason = reason;
                item.requestStatus = 'pending';
            }
        } else {
            // Return entire order
            if (order.status === 'delivered') {
                order.status = 'return_requested';
                order.returnReason = reason;
                order.requestStatus = 'pending';
                order.orderedItems.forEach(item => {
                    if (item.status === 'delivered') {
                        item.status = 'return_requested';
                        item.returnReason = reason;
                        item.requestStatus = 'pending';
                    }
                });
            }
        }

        await order.save();
        res.json({ success: true, message: 'Return request submitted successfully' });

    } catch (error) {
        console.error('Error in returnOrder:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const cancelReturn = async (req, res) => {
    try {
        const { orderId, itemId } = req.body;
        const userId = req.session.user;

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (itemId) {
            // Cancel return for specific item
            const item = order.orderedItems.id(itemId);
            if (!item) {
                return res.status(404).json({ success: false, message: 'Item not found' });
            }
            if (item.status === 'return_requested') {
                item.status = 'delivered';
                item.returnReason = null;
                item.requestStatus = null;
            }
        } else {
            // Cancel return for entire order
            if (order.status === 'return_requested') {
                order.status = 'delivered';
                order.returnReason = null;
                order.requestStatus = null;
                order.orderedItems.forEach(item => {
                    if (item.status === 'return_requested') {
                        item.status = 'delivered';
                        item.returnReason = null;
                        item.requestStatus = null;
                    }
                });
            }
        }

        await order.save();
        res.json({ success: true, message: 'Return request cancelled successfully' });

    } catch (error) {
        console.error('Error in cancelReturn:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    placeOrder,
    getOrders,
    loadOrderDetails,
    cancelOrder,
    returnOrder,
    cancelReturn
};