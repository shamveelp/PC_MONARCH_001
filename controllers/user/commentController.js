const Comment = require('../../models/commentSchema');

const addComment = async (req, res) => {
  try {
    const { productId, comment } = req.body;
    const userId = req.session.user;

    // Check if comment is empty
    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({
        status: false,
        message: 'Comment cannot be empty'
      });
    }

    // Check comment length
    if (comment.length > 500) {
      return res.status(400).json({
        status: false,
        message: 'Comment is too long (maximum 500 characters)'
      });
    }

    // Check daily comment limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const commentCount = await Comment.countDocuments({
      userId,
      createdAt: {
        $gte: today,
        $lt: tomorrow
      }
    });

    if (commentCount >= 3) {
      return res.status(400).json({
        status: false,
        message: 'You have reached the maximum limit of 3 comments per day'
      });
    }

    const newComment = new Comment({
      productId,
      userId,
      comment: comment.trim()
    });

    await newComment.save();

    res.status(200).json({
      status: true,
      message: 'Comment added successfully'
    });
  } catch (error) {
    console.error('Error in addComment:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error'
    });
  }
};

const getProductComments = async (req, res) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const comments = await Comment.find({
      productId,
      isBlocked: false
    })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Comment.countDocuments({
      productId,
      isBlocked: false
    });

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      status: true,
      data: comments,
      pagination: {
        currentPage: page,
        totalPages,
        totalComments: total
      }
    });
  } catch (error) {
    console.error('Error in getProductComments:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error'
    });
  }
};

const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.session.user;

    const comment = await Comment.findOne({ _id: commentId, userId });

    if (!comment) {
      return res.status(404).json({
        status: false,
        message: 'Comment not found or you are not authorized to delete this comment'
      });
    }

    await Comment.deleteOne({ _id: commentId });

    res.status(200).json({
      status: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteComment:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  addComment,
  getProductComments,
  deleteComment
};