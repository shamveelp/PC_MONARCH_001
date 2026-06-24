import mongoose from 'mongoose';
import Order from "./models/orderSchema.js";
import PAYMENT_STATUS from "./enums/paymentStatus.js";

async function test() {
    await mongoose.connect('mongodb://localhost:27017/pc-monarch-final');
    const order = await Order.findOne().sort({ createdOn: -1 });
    console.log("Last Order ID:", order._id);
    console.log("Payment Method:", order.paymentMethod);
    console.log("Payment Status:", order.paymentStatus);
    console.log("PAYMENT_STATUS.SUCCESS:", PAYMENT_STATUS.SUCCESS);
    
    const isOnlineSuccess = order.paymentMethod === "online" && order.paymentStatus === PAYMENT_STATUS.SUCCESS;
    console.log("isOnlineSuccess:", isOnlineSuccess);
    process.exit(0);
}
test();
