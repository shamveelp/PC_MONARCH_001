import mongoose from 'mongoose';
const { Schema } = mongoose;
import { generateOrderId } from '../utils/generateOrderId.js';

import ORDER_STATUS from '../enums/orderStatus.js';
import PAYMENT_STATUS from '../enums/paymentStatus.js';

const orderSchema = new Schema({
    orderId: {
        type: String,
        default: generateOrderId,
        unique: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderedItems: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        productName: { 
            type: String,
            required: true
        },
        productImages: [{ 
            type: String
        }],
        quantity: {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            default: 0
        },
        regularPrice: {
            type: Number,
            default: 0
        },
        status: {
            type: String,
            enum: [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED, ORDER_STATUS.SHIPPED, ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED, ORDER_STATUS.RETURN_REQUESTED, ORDER_STATUS.RETURNING, ORDER_STATUS.RETURNED],
            default: ORDER_STATUS.PENDING
        },
        cancelReason: {
            type: String
        }
    }],
    totalPrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    deliveryCharge: {
        type: Number,
        default: 50
    },
    finalAmount: {
        type: Number,
        required: true
    },
    address: {
        type: Schema.Types.Mixed,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['cod', 'online', 'wallet'],
        required: true
    },
    invoiceDate: {
        type: Date
    },
    status: {
        type: String,
        required: true,
        enum: [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED, ORDER_STATUS.SHIPPED, ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED, ORDER_STATUS.RETURN_REQUESTED, ORDER_STATUS.RETURNING, ORDER_STATUS.RETURNED],
        default: ORDER_STATUS.PENDING
    },
    paymentStatus: {
        type: String,
        enum: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.FAILED],
        default: PAYMENT_STATUS.PENDING
    },
    cancelReason: {
        type: String
    },
    returnReason: {
        type: String
    },
    returnDescription: {
        type: String
    },
    returnImages: [{
        type: String
    }],
    requestStatus: {
        type: String,
        enum: [ORDER_STATUS.PENDING, 'approved', 'rejected'],
        default: ORDER_STATUS.PENDING
    },
    rejectionCategory: {
        type: String
    },
    rejectionReason: {
        type: String
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    updatedOn: {
        type: Date,
    },
    deliveredOn: {
        type: Date
    },
    couponApplied: {
        type: Boolean,
        default: false
    }
});

orderSchema.pre('save', async function(next) {
    if (this.isNew) {
        let isUnique = false;
        while (!isUnique) {
            const existingOrder = await mongoose.models.Order.findOne({ orderId: this.orderId });
            if (existingOrder) {
                this.orderId = generateOrderId();
            } else {
                isUnique = true;
            }
        }
    }
    next();
});

const Order = mongoose.model('Order', orderSchema);
export default Order;