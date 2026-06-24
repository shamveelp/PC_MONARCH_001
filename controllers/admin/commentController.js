import logger from '../../utils/logger.js';
import Comment from "../../models/commentSchema.js";

import STATUS_CODES from '../../enums/statusCodes.js';
import MESSAGES from '../../enums/constants.js';

const getAllComments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const comments = await Comment.find()
      .populate('userId', 'name email')
      .populate('productId', 'productName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Comment.countDocuments();
    const totalPages = Math.ceil(total / limit);

    return res.render('comments', {
      comments,
      currentPage: page,
      totalPages,
      totalComments: total
    });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_GETALLCOMMENTS, error);
    res.redirect('/admin/pageerror');
  }
};

const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    await Comment.findByIdAndDelete(commentId);
    
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

const blockComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    await Comment.findByIdAndUpdate(commentId, {
      isBlocked: true
    });
    
    res.status(STATUS_CODES.OK).json({
      status: true,
      message: MESSAGES.COMMENT_BLOCKED_SUCCESSFULLY
    });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_BLOCKCOMMENT, error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      status: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR_1
    });
  }
};

const unblockComment  = async (req, res) => {
    try {

        const { commentId } = req.params;
        await Comment.findByIdAndUpdate(commentId, {
            isBlocked: false
        });
        res.status(STATUS_CODES.OK).json({
            status: true,
            message: MESSAGES.COMMENT_UNBLOCKED_SUCCESSFULLY
        })
        
    } catch (error) {
        logger.error(MESSAGES.ERROR_IN_UNBLOCKCOMMENT, error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: MESSAGES.INTERNAL_SERVER_ERROR_1
        });
        
    }
}


export default {
  getAllComments,
  deleteComment,
  blockComment,
  unblockComment,
};