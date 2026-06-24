import Order from '../models/orderSchema.js';
import Product from '../models/productSchema.js';
import logger from './logger.js';
import ORDER_STATUS from '../enums/orderStatus.js';

const startCronJobs = () => {
  // Run every 1 minute (60000 ms)
  setInterval(async () => {
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      
      const pendingOrders = await Order.find({
        status: ORDER_STATUS.PENDING,
        createdOn: { $lt: fifteenMinutesAgo }
      });

      for (const order of pendingOrders) {
        order.status = ORDER_STATUS.CANCELLED;
        order.cancelReason = "Payment timeout";
        order.orderedItems[0].status = ORDER_STATUS.CANCELLED;
        order.orderedItems[0].cancelReason = "Payment timeout";
        
        await order.save();

        // Return stock
        await Product.findByIdAndUpdate(order.orderedItems[0].product, {
          $inc: { quantity: order.orderedItems[0].quantity },
        });
        
        logger.info(`Auto-cancelled order ${order.orderId} due to payment timeout.`);
      }
    } catch (error) {
      logger.error("Error in auto-cancel cron job", error);
    }
  }, 60 * 1000);
};

export default startCronJobs;
