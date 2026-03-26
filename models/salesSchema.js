import mongoose from 'mongoose';

const saleSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  coupon: {
    type: Number,
    default: 0
  },
  date: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Sale', saleSchema);