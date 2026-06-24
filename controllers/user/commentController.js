import logger from '../../utils/logger.js';
import Comment from '../../models/commentSchema.js';

import STATUS_CODES from '../../enums/statusCodes.js';
import MESSAGES from '../../enums/constants.js';

const addComment = async (req, res) => {
  try {
    const { productId, comment } = req.body;
    const userId = req.session.user;

    if (!comment || comment.trim().length === 0) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        status: false,
        message: MESSAGES.COMMENT_CANNOT_BE_EMPTY
      });
    }

    if (comment.length > 500) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        status: false,
        message: MESSAGES.COMMENT_IS_TOO_LONG_MAXIMUM_500_CHARACTERS
      });
    }

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
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        status: false,
        message: MESSAGES.YOU_HAVE_REACHED_THE_MAXIMUM_LIMIT_OF_3_COMMENTS_P
      });
    }

    const newComment = new Comment({
      productId,
      userId,
      comment: comment.trim()
    });

    await newComment.save();

    res.status(STATUS_CODES.OK).json({
      status: true,
      message: MESSAGES.COMMENT_ADDED_SUCCESSFULLY
    });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_ADDCOMMENT, error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      status: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR_1
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

    res.status(STATUS_CODES.OK).json({
      status: true,
      data: comments,
      pagination: {
        currentPage: page,
        totalPages,
        totalComments: total
      }
    });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_GETPRODUCTCOMMENTS, error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      status: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR_1
    });
  }
};

const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.session.user;

    const comment = await Comment.findOne({ _id: commentId, userId });

    if (!comment) {
      return res.status(STATUS_CODES.NOT_FOUND).json({
        status: false,
        message: MESSAGES.COMMENT_NOT_FOUND_OR_YOU_ARE_NOT_AUTHORIZED_TO_DEL
      });
    }

    await Comment.deleteOne({ _id: commentId });

    res.status(STATUS_CODES.OK).json({
      status: true,
      message: MESSAGES.COMMENT_DELETED_SUCCESSFULLY
    });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_DELETECOMMENT, error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      status: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR_1
    });
  }
};

export default {
  addComment,
  getProductComments,
  deleteComment
}