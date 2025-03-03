const Transaction = require('../../models/transactionSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const User = require('../../models/userSchema');

// Create a new transaction
const createTransaction = async (transactionData) => {
    try {
        const transaction = new Transaction(transactionData);
        await transaction.save();
        return transaction;
    } catch (error) {
        console.error('Error creating transaction:', error);
        throw error;
    }
};

// Create a wallet transaction and update wallet
const createWalletTransaction = async (userId, amount, transactionType, purpose, description, orderId = null) => {
    try {
        // Find or create wallet
        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = new Wallet({ userId, balance: 0 });
        }

        // Update wallet balance
        if (transactionType === 'credit') {
            wallet.balance += amount;
            if (purpose === 'refund') {
                wallet.refundAmount += amount;
            }
        } else if (transactionType === 'debit') {
            wallet.balance -= amount;
            wallet.totalDebited += amount;
        }

        // Create transaction record
        const transaction = await createTransaction({
            userId,
            amount,
            transactionType,
            paymentMethod: 'wallet',
            paymentGateway: 'wallet',
            purpose,
            description,
            orders: orderId ? [{ orderId, amount }] : [],
            walletBalanceAfter: wallet.balance
        });

        // Add to wallet transactions
        wallet.transactions.push({
            transactionId: transaction.transactionId,
            amount,
            transactionType,
            transactionPurpose: purpose,
            description
        });

        await wallet.save();
        return { transaction, wallet };
    } catch (error) {
        console.error('Error creating wallet transaction:', error);
        throw error;
    }
};

// Create a transaction for online payment
const createOnlinePaymentTransaction = async (userId, amount, gatewayTransactionId, orders) => {
    try {
        const orderIds = orders.map(order => ({
            orderId: order.orderId,
            amount: order.finalAmount
        }));

        const transaction = await createTransaction({
            userId,
            amount,
            transactionType: 'debit',
            paymentMethod: 'online',
            paymentGateway: 'razorpay',
            gatewayTransactionId,
            purpose: 'purchase',
            description: 'Online payment for order',
            orders: orderIds
        });

        return transaction;
    } catch (error) {
        console.error('Error creating online payment transaction:', error);
        throw error;
    }
};

// Process refund for cancelled or returned order
const processRefundTransaction = async (userId, order) => {
    try {
        const refundAmount = order.finalAmount - order.deliveryCharge;
        
        // Create transaction record for the refund
        const transaction = await createTransaction({
            userId,
            amount: refundAmount,
            transactionType: 'credit',
            paymentMethod: 'refund',
            paymentGateway: order.paymentMethod === 'online' ? 'razorpay' : 'wallet',
            purpose: order.status === 'cancelled' ? 'cancellation' : 'return',
            description: `Refund for ${order.status === 'cancelled' ? 'cancelled' : 'returned'} order #${order.orderId}`,
            orders: [{ orderId: order.orderId, amount: refundAmount }]
        });

        // Update wallet with refund
        const { wallet } = await createWalletTransaction(
            userId,
            refundAmount,
            'credit',
            'refund',
            `Refund for ${order.status === 'cancelled' ? 'cancelled' : 'returned'} order #${order.orderId}`,
            order.orderId
        );

        return { transaction, wallet };
    } catch (error) {
        console.error('Error processing refund transaction:', error);
        throw error;
    }
};

// Get all transactions for admin
const getAllTransactions = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        const filter = {};
        
        // Apply filters if provided
        if (req.query.userId) filter.userId = req.query.userId;
        if (req.query.transactionType) filter.transactionType = req.query.transactionType;
        if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;
        if (req.query.purpose) filter.purpose = req.query.purpose;
        if (req.query.orderId) filter['orders.orderId'] = req.query.orderId;
        
        // Date range filter
        if (req.query.startDate && req.query.endDate) {
            filter.createdAt = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate)
            };
        }

        const transactions = await Transaction.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'name email phone')
            .lean();

        const total = await Transaction.countDocuments(filter);
        
        // Populate order details for each transaction
        const populatedTransactions = await Promise.all(transactions.map(async (transaction) => {
            if (transaction.orders && transaction.orders.length > 0) {
                const orderDetails = await Promise.all(transaction.orders.map(async (orderRef) => {
                    const order = await Order.findOne({ orderId: orderRef.orderId }).lean();
                    return {
                        ...orderRef,
                        orderDetails: order || null
                    };
                }));
                transaction.orders = orderDetails;
            }
            return transaction;
        }));

        res.render('transactions', {
            transactions: populatedTransactions,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalTransactions: total
        });
    } catch (error) {
        console.error('Error getting transactions:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Get transaction details
const getTransactionDetails = async (req, res) => {
    try {
        const { transactionId } = req.params;
        
        const transaction = await Transaction.findOne({ transactionId })
            .populate('userId', 'name email phone')
            .lean();
            
        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }
        
        // Populate order details
        if (transaction.orders && transaction.orders.length > 0) {
            const orderDetails = await Promise.all(transaction.orders.map(async (orderRef) => {
                const order = await Order.findOne({ orderId: orderRef.orderId })
                    .populate('orderedItems.product')
                    .lean();
                return {
                    ...orderRef,
                    orderDetails: order || null
                };
            }));
            transaction.orders = orderDetails;
        }
        
        res.render('admin/transaction-details', {
            transaction
        });
    } catch (error) {
        console.error('Error getting transaction details:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Get user transactions (for user profile)
const getUserTransactions = async (req, res) => {
    try {
        const userId = req.session.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        const transactions = await Transaction.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
            
        const total = await Transaction.countDocuments({ userId });
        
        // Populate order details for each transaction
        const populatedTransactions = await Promise.all(transactions.map(async (transaction) => {
            if (transaction.orders && transaction.orders.length > 0) {
                const orderDetails = await Promise.all(transaction.orders.map(async (orderRef) => {
                    const order = await Order.findOne({ orderId: orderRef.orderId }).lean();
                    return {
                        ...orderRef,
                        orderDetails: order || null
                    };
                }));
                transaction.orders = orderDetails;
            }
            return transaction;
        }));
        
        const user = await User.findById(userId);
        
        res.render('user/transactions', {
            transactions: populatedTransactions,
            user,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalTransactions: total
        });
    } catch (error) {
        console.error('Error getting user transactions:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    createTransaction,
    createWalletTransaction,
    createOnlinePaymentTransaction,
    processRefundTransaction,
    getAllTransactions,
    getTransactionDetails,
    getUserTransactions
};