const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");

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

        // Create separate order for each cart item
        const orders = await Promise.all(user.cart.map(async (item) => {
            const order = new Order({
                userId: userId,
                orderedItems: [{
                    product: item.productId._id,
                    quantity: item.quantity,
                    price: item.productId.salePrice,
                    status: 'pending'
                }],
                totalPrice: item.productId.salePrice * item.quantity,
                finalAmount: item.productId.salePrice * item.quantity,
                address: selectedAddress,
                status: 'pending',
                createdOn: new Date()
            });

            // Update product quantity
            await Product.findByIdAndUpdate(item.productId._id, {
                $inc: { quantity: -item.quantity }
            });

            return order.save();
        }));

        // Clear cart
        await User.findByIdAndUpdate(userId, { $set: { cart: [] } });

        res.json({
            success: true,
            orderIds: orders.map(order => order.orderId),
            message: 'Orders placed successfully'
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
        const { orderId, reason } = req.body;
        const userId = req.session.user;

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
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

            await order.save();
            res.json({ success: true, message: 'Order cancelled successfully' });
        } else {
            res.status(400).json({ success: false, message: 'Order cannot be cancelled' });
        }

    } catch (error) {
        console.error('Error in cancelOrder:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    placeOrder,
    getOrders,
    loadOrderDetails,
    cancelOrder
};