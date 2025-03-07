const Comment = require("../../models/commentSchema")

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
    console.error('Error in getAllComments:', error);
    res.redirect('/admin/pageerror');
  }
};

const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    await Comment.findByIdAndDelete(commentId);
    
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

const blockComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    await Comment.findByIdAndUpdate(commentId, {
      isBlocked: true
    });
    
    res.status(200).json({
      status: true,
      message: 'Comment blocked successfully'
    });
  } catch (error) {
    console.error('Error in blockComment:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error'
    });
  }
};

const unblockComment  = async (req, res) => {
    try {

        const { commentId } = req.params;
        await Comment.findByIdAndUpdate(commentId, {
            isBlocked: false
        });
        res.status(200).json({
            status: true,
            message: 'Comment unblocked successfully'
        })
        
    } catch (error) {
        console.error('Error in unblockComment:', error);
        res.status(500).json({
            status: false,
            message: 'Internal server error'
        });
        
    }
}





module.exports = {
  getAllComments,
  deleteComment,
  blockComment,
  unblockComment,

};