import mongoose from 'mongoose';
const { Schema } = mongoose;

const commentSchema = new Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  comment: {
    type: String,
    required: true,
    trim: true,
    maxLength: 500
  },
  isBlocked: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

const Comment = mongoose.model('Comment', commentSchema);
export default Comment;