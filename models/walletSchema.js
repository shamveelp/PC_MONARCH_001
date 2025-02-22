const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    balance: {
        type: Number,
        required: true,
        default: 0
    },
    refundAmount: {
        type: Number,
        required: true,
        default: 0
    },
    totalDebited: {
        type: Number,
        required: true,
        default: 0
    },
    transactions: [
        {
            amount: {
                type: Number,
                required: true
            },
            transactionType: {
                type: String,
                enum: ['credit', 'debit'],
                required: true
            },
            transactionPurpose: {
                type: String,
                enum: ['refund', 'add', 'withdraw','purchase'],
                required: true
            },
            description: {
                type: String,
                default: ''
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ]
}, { timestamps: true });

const Wallet = mongoose.model('Wallet', walletSchema);
module.exports = Wallet;
