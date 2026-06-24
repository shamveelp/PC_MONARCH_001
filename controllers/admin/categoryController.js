import logger from '../../utils/logger.js';
import Category from "../../models/categorySchema.js";
import Product from "../../models/productSchema.js";
import { calculateEffectivePrice } from "./productController.js";



import STATUS_CODES from '../../enums/statusCodes.js';
import MESSAGES from '../../enums/constants.js';

const addCategory = async (req, res) => {
  try {
    const { name, description } = req.body

    
    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length === 0) {
    
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.CATEGORY_NAME_CANNOT_BE_EMPTY })
    }

    if (!description) {
    
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.DESCRIPTION_IS_REQUIRED })
    }

    
    const existingCategory = await Category.findOne({ name: new RegExp(`^${trimmedName}$`, "i") })
    if (existingCategory) {
      
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.CATEGORY_WITH_THIS_NAME_ALREADY_EXISTS })
    }

    const newCategory = new Category({ name: trimmedName, description })
    const savedCategory = await newCategory.save()
    
    res.status(STATUS_CODES.CREATED).json({ success: true, message: MESSAGES.CATEGORY_ADDED_SUCCESSFULLY, category: savedCategory })
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_ADDCATEGORY, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.FAILED_TO_ADD_CATEGORY, error: error.message })
  }
}

const addCategoryOffer = async (req, res) => {
  try {
    const { categoryId, percentage } = req.body;
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ status: false, message: MESSAGES.CATEGORY_NOT_FOUND });
    }
    if (isNaN(percentage) || percentage < 0 || percentage > 99) {
      return res.json({ status: false, message: MESSAGES.INVALID_PERCENTAGE_VALUE });
    }
    await Category.updateOne({ _id: categoryId }, { $set: { categoryOffer: percentage } });

    // Update all products in this category
    const products = await Product.find({ category: categoryId });
    for (const product of products) {
      product.salePrice = await calculateEffectivePrice(product);
      await product.save();
    }

    res.json({ status: true, message: MESSAGES.OFFER_ADDED_SUCCESSFULLY });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_ADDCATEGORYOFFER, error);
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ status: false, message: MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

const categoryInfo = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = 12
    const skip = (page - 1) * limit

    const query = {}
    if (req.query.search) {
      query.name = { $regex: `^${req.query.search}`, $options: "i" }
    }
    if (req.query.minOffer || req.query.maxOffer) {
      query.categoryOffer = {}
      if (req.query.minOffer) query.categoryOffer.$gte = Number.parseInt(req.query.minOffer)
      if (req.query.maxOffer) query.categoryOffer.$lte = Number.parseInt(req.query.maxOffer)
    }

    const categories = await Category.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)

    const totalCategories = await Category.countDocuments(query)
    const totalPages = Math.ceil(totalCategories / limit)

    if (req.xhr || req.headers.accept.indexOf("json") > -1) {
      // If it's an AJAX request, send JSON response
      res.json({
        categories: categories,
        currentPage: page,
        totalPages: totalPages,
        totalCategories: totalCategories,
      })
    } else {
      // If it's a regular request, render the page
      res.render("category", {
        categories: categories,
        currentPage: page,
        totalPages: totalPages,
        totalCategories: totalCategories,
      })
    }
  } catch (error) {
    logger.error(error)
    if (req.xhr || req.headers.accept.indexOf("json") > -1) {
      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ error: "An error occurred while fetching categories" })
    } else {
      res.redirect("/pageerror")
    }
  }
}

const removeCategoryOffer = async (req, res) => {
  try {
    const categoryId = req.body.categoryId;
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ status: false, message: MESSAGES.CATEGORY_NOT_FOUND });
    }
    await Category.updateOne({ _id: categoryId }, { $set: { categoryOffer: null } });

    // Update all products in this category
    const products = await Product.find({ category: categoryId });
    for (const product of products) {
      product.salePrice = await calculateEffectivePrice(product);
      await product.save();
    }

    res.json({ status: true, message: MESSAGES.OFFER_REMOVED_SUCCESSFULLY });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_REMOVECATEGORYOFFER, error);
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ status: false, message: MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

const getListCategory = async (req, res) => {
  try {
    const id = req.query.id
    await Category.findByIdAndUpdate(id, { isListed: false })
    res.json({ success: true, message: MESSAGES.CATEGORY_UNLISTED_SUCCESSFULLY })
  } catch (error) {
    logger.error(error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.FAILED_TO_UNLIST_CATEGORY })
  }
}

const getUnlistCategory = async (req, res) => {
  try {
    const id = req.query.id
    await Category.findByIdAndUpdate(id, { isListed: true })
    res.json({ success: true, message: MESSAGES.CATEGORY_LISTED_SUCCESSFULLY })
  } catch (error) {
    logger.error(error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.FAILED_TO_LIST_CATEGORY })
  }
}

const getEditCategory = async (req, res) => {
  try {
    const categoryId = req.params.id
    const category = await Category.findById(categoryId)
    if (!category) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.CATEGORY_NOT_FOUND })
    }
    res.json({ success: true, category })
  } catch (error) {
    logger.error(error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.FAILED_TO_FETCH_CATEGORY })
  }
}

const editCategory = async (req, res) => {
  try {
    const categoryId = req.params.id
    const { name, description } = req.body
    const updatedCategory = await Category.findByIdAndUpdate(categoryId, { name, description }, { new: true })
    if (!updatedCategory) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.CATEGORY_NOT_FOUND })
    }
    res.json({ success: true, message: MESSAGES.CATEGORY_UPDATED_SUCCESSFULLY })
  } catch (error) {
    logger.error(error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.FAILED_TO_UPDATE_CATEGORY })
  }
}

const editCategoryOffer = async (req, res) => {
  try {
    const percentage = Number.parseInt(req.body.percentage);
    const categoryId = req.body.categoryId;

    if (isNaN(percentage) || percentage < 0 || percentage > 99) {
      return res.json({ status: false, message: MESSAGES.INVALID_PERCENTAGE_VALUE });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ status: false, message: MESSAGES.CATEGORY_NOT_FOUND });
    }

    await Category.updateOne({ _id: categoryId }, { $set: { categoryOffer: percentage } });

    const products = await Product.find({ category: categoryId });
    for (const product of products) {
      product.salePrice = await calculateEffectivePrice(product);
      await product.save();
    }

    res.json({ status: true, message: MESSAGES.OFFER_UPDATED_SUCCESSFULLY });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_EDITCATEGORYOFFER, error);
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ status: false, message: MESSAGES.INTERNAL_SERVER_ERROR });
  }
};


const deleteCategory = async (req, res) => {
    try {
      const categoryId = req.params.id
      const deletedCategory = await Category.findByIdAndDelete(categoryId)
      if (!deletedCategory) {
        return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.CATEGORY_NOT_FOUND })
      }
      res.json({ success: true, message: MESSAGES.CATEGORY_DELETED_SUCCESSFULLY })
    } catch (error) {
      logger.error(MESSAGES.ERROR_IN_DELETECATEGORY, error)
      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.FAILED_TO_DELETE_CATEGORY })
    }
  }

export default {
  categoryInfo,
  addCategory,
  addCategoryOffer,
  editCategoryOffer,
  removeCategoryOffer,
  getListCategory,
  getUnlistCategory,
  getEditCategory,
  editCategory,
  deleteCategory,
}
