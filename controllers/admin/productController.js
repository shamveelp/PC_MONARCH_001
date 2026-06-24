import logger from '../../utils/logger.js';
import Product from "../../models/productSchema.js";
import Category from "../../models/categorySchema.js";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';
import { uploadBuffer, uploadBase64, cloudinary } from "../../config/cloudinary.js";

import STATUS_CODES from '../../enums/statusCodes.js';
import MESSAGES from '../../enums/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const calculateEffectivePrice = async (product) => {
  const category = await Category.findById(product.category);
  const categoryOffer = category ? category.categoryOffer || 0 : 0;
  const productOffer = product.productOffer || 0;

  const effectiveOffer = Math.max(categoryOffer, productOffer);
  const effectivePrice = product.regularPrice * (1 - effectiveOffer / 100);

  return Math.round(effectivePrice * 100) / 100;
};



const getProductAddPage = async (req, res) => {
  try {
    const category = await Category.find({ isListed: true })
    res.render("product-add", {
      cat: category,
    })
  } catch (error) {
    logger.error(MESSAGES.ERROR_LOADING_PRODUCT_ADD_PAGE_1, error)
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.ERROR_LOADING_PRODUCT_ADD_PAGE })
  }
}

const saveImage = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.NO_IMAGE_FILE_PROVIDED });
    }

    // Resize & convert to WebP before uploading to Cloudinary
    const processedBuffer = await sharp(file.buffer)
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const uploadResult = await uploadBuffer(processedBuffer, "product-images");

    return res.status(STATUS_CODES.OK).json({ success: true, message: MESSAGES.IMAGE_SAVED_SUCCESSFULLY, filename: uploadResult.secure_url });
  } catch (error) {
    logger.error(MESSAGES.ERROR_SAVING_IMAGE_1, error);
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.ERROR_SAVING_IMAGE });
  }
};


const addProducts = async (req, res) => {
  try {
    const { productName, description, fullDescription, brand, category, regularPrice, salePrice, quantity, color, processor, graphicsCard, storages, display, operatingSystem, boxContains } = req.body;
    
  
    const productExists = await Product.findOne({ productName });
    if (productExists) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.PRODUCT_ALREADY_EXISTS_TRY_ANOTHER_NAME });
    }

   
    const imageURLs = [];

    for (let i = 1; i <= 4; i++) {
      const croppedImageData = req.body[`croppedImage${i}`];
      
      if (croppedImageData && croppedImageData.startsWith('data:image')) {
        const uploadResult = await uploadBase64(croppedImageData, "product-images");
        imageURLs.push(uploadResult.secure_url);
      } else if (req.files && req.files[`image${i}`]) {
        const file = req.files[`image${i}`][0];
        
        const processedBuffer = await sharp(file.buffer)
          .resize(800, 800, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        const uploadResult = await uploadBuffer(processedBuffer, "product-images");
        imageURLs.push(uploadResult.secure_url);
      }
    }

    if (imageURLs.length < 4) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.PLEASE_UPLOAD_ALL_4_PRODUCT_IMAGES });
    }

    
    const foundCategory = await Category.findOne({ name: category });
    if (!foundCategory) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.CATEGORY_NOT_FOUND });
    }

    
    const newProduct = new Product({
      productName,
      description,
      fullDescription,
      brand,
      category: foundCategory._id, 
      regularPrice,
      salePrice,
      quantity,
      color,
      processor,
      graphicsCard,
      storages,
      display,
      operatingSystem,
      boxContains,
      productImage: imageURLs,
      status: "available",
    });

    await newProduct.save();
    return res.status(STATUS_CODES.OK).json({ success: true, message: MESSAGES.PRODUCT_ADDED_SUCCESSFULLY });
  } catch (error) {
    logger.error(MESSAGES.ERROR_SAVING_PRODUCT_1, error);
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.ERROR_SAVING_PRODUCT });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 19;

    const query = {
      $or: [
        { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
        { brand: { $regex: new RegExp(".*" + search + ".*", "i") } }
      ]
    };

    const productData = await Product.find(query)
      .sort({ createdAt: 1 }) // Newest first
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("category")
      .exec();

    const count = await Product.countDocuments(query);
    const totalPages = Math.ceil(count / limit);
    const category = await Category.find({ isListed: true });
    const productsWithEffectivePrices = await Promise.all(productData.map(async (product) => {
      const effectivePrice = await calculateEffectivePrice(product);
      return {
        ...product.toObject(),
        salePrice: effectivePrice
      };
    }));

    if (category.length > 0) {
      res.render("products", {
        data: productsWithEffectivePrices,
        currentPage: page,
        totalPages: totalPages,
        cat: category,
      });
    } else {
      res.render("admin-error");
    }
  } catch (error) {
    logger.error(MESSAGES.ERROR_FETCHING_PRODUCTS, error);
    res.render("admin-error");
  }
};



const addProductOffer = async (req, res) => {
  try {
    const { productId, percentage } = req.body;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ status: false, message: MESSAGES.PRODUCT_NOT_FOUND });
    }

    product.productOffer = parseInt(percentage);
    product.salePrice = await calculateEffectivePrice(product);
    await product.save();

    res.json({ status: true, message: MESSAGES.OFFER_ADDED_SUCCESSFULLY });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_ADDPRODUCTOFFER, error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ status: false, message: MESSAGES.INTERNAL_SERVER_ERROR_1 });
  }
};

const removeProductOffer = async (req, res) => {
  try {
    const { productId } = req.body;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ status: false, message: MESSAGES.PRODUCT_NOT_FOUND });
    }

    product.productOffer = 0;
    product.salePrice = await calculateEffectivePrice(product);
    await product.save();

    res.json({ status: true, message: MESSAGES.OFFER_REMOVED_SUCCESSFULLY });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_REMOVEPRODUCTOFFER, error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ status: false, message: MESSAGES.INTERNAL_SERVER_ERROR_1 });
  }
};

const blockProduct = async (req,res) => {
  try {

    let id = req.query.id;
    let currentPage = req.query.page || 1;
    await Product.updateOne({_id:id},{$set:{isBlocked:true}});
    res.redirect(`/admin/products?page=${currentPage}`)
    
  } catch (error) {
    res.redirect("/pageerror")
    
  }
}

const unblockProduct = async (req,res) => {
  try {

    let id = req.query.id;
    await Product.updateOne({_id:id},{$set:{isBlocked:false}});
    res.redirect("/admin/products")
    
  } catch (error) {
    res.redirect("/pageerror")
    
  }
}

const getEditProduct = async (req, res) => {
  try {
    const id = req.query.id
    const product = await Product.findOne({ _id: id }).populate("category")
    const categories = await Category.find({})

    if (!product) {
      return res.status(STATUS_CODES.NOT_FOUND).send(MESSAGES.PRODUCT_NOT_FOUND)
    }

    res.render("product-edit", {
      product: product,
      cat: categories,
    })
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_GETEDITPRODUCT, error)
    res.redirect("/pageerror")
  }
}

const editProduct = async (req, res) => {
  try {
    const id = req.params.id
    const {
      productName,
      description,
      fullDescription,
      regularPrice,
      salePrice,
      quantity,
      color,
      brand,
      processor,
      graphicsCard,
      storages,
      display,
      operatingSystem,
      boxContains,
      category,
    } = req.body

    const existingProduct = await Product.findOne({
      productName: productName,
      _id: { $ne: id },
    })

    if (existingProduct) {
      return res
        .status(400)
        .json({ success: false, message: MESSAGES.PRODUCT_WITH_THIS_NAME_ALREADY_EXISTS_PLEASE_TRY_A })
    }

    const updateFields = {
      productName,
      description,
      fullDescription,
      regularPrice,
      salePrice,
      quantity,
      color,
      brand,
      processor,
      graphicsCard,
      storages,
      display,
      operatingSystem,
      boxContains,
      category,
    }

    const product = await Product.findById(id)
    if (!product) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.PRODUCT_NOT_FOUND })
    }

    
    for (let i = 1; i <= 4; i++) {
      const croppedImageData = req.body[`croppedImage${i}`];
      
      if (croppedImageData && croppedImageData.startsWith('data:image')) {
        const uploadResult = await uploadBase64(croppedImageData, "product-images");
        const imageURL = uploadResult.secure_url;

        // Optionally delete old image from Cloudinary here
        if (product.productImage[i - 1]) {
          const oldPublicId = product.productImage[i - 1].split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`product-images/${oldPublicId}`);
          product.productImage[i - 1] = imageURL;
        } else {
          product.productImage.push(imageURL);
        }
      } else if (req.files && req.files[`image${i}`]) {
        const file = req.files[`image${i}`][0];
        const processedBuffer = await sharp(file.buffer)
          .resize(800, 800, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        const uploadResult = await uploadBuffer(processedBuffer, "product-images");
        const imageURL = uploadResult.secure_url;

            // Delete old image if it exists
            if (product.productImage[i - 1]) {
              const oldImage = product.productImage[i - 1];
              if (oldImage.startsWith('http')) {
                const oldPublicId = oldImage.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(`product-images/${oldPublicId}`);
              } else {
                // Should we delete local too? Maybe not necessary for this task, but good practice
                try {
                  const fullPath = path.join(process.cwd(), 'public', oldImage);
                  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                } catch (e) {
                  logger.error(MESSAGES.LOCAL_UNLINK_ERROR, e);
                }
              }
              product.productImage[i - 1] = imageURL;
            } else {
              product.productImage.push(imageURL);
            }
          }
        }

    Object.assign(product, updateFields);
    await product.save();

    res.json({ success: true, message: MESSAGES.PRODUCT_UPDATED_SUCCESSFULLY });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_EDITPRODUCT, error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.AN_ERROR_OCCURRED_WHILE_UPDATING_THE_PRODUCT });
  }
};



const deleteSingleImage = async (req, res) => {
  try {
    const { imageNameToServer, productIdToServer, imageIndex } = req.body;
    const product = await Product.findById(productIdToServer);

    if (!product) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ status: false, message: MESSAGES.PRODUCT_NOT_FOUND });
    }

    
    product.productImage.splice(imageIndex, 1);
    await product.save();

    // Delete from Cloudinary
    if (imageNameToServer && imageNameToServer.startsWith('http')) {
      const publicId = imageNameToServer.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`product-images/${publicId}`);
      logger.info(`Image ${publicId} deleted from Cloudinary successfully`);
    }

    res.json({ status: true, message: MESSAGES.IMAGE_DELETED_SUCCESSFULLY });
  } catch (error) {
    logger.error(MESSAGES.ERROR_IN_DELETESINGLEIMAGE, error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ status: false, message: MESSAGES.AN_ERROR_OCCURRED_WHILE_DELETING_THE_IMAGE });
  }
};



const deleteProduct = async (req, res) => {
  const productId = req.query.id;
  
  if (!productId) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ status: false, message: MESSAGES.PRODUCT_ID_IS_REQUIRED });
  }
  
  try {
      
      const product = await Product.findByIdAndDelete(productId);

      if (!product) {
          return res.status(STATUS_CODES.NOT_FOUND).json({ status: false, message: MESSAGES.PRODUCT_NOT_FOUND });
      }

      res.redirect('/admin/products'); 
  } catch (err) {
      logger.error(err);
      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ status: false, message: MESSAGES.SERVER_ERROR });
  }
}


export {
  getProductAddPage,
  saveImage,
  addProducts,
  getAllProducts,
  addProductOffer,
  removeProductOffer,
  blockProduct,
  unblockProduct,
  getEditProduct,
  editProduct,
  deleteSingleImage,
  deleteProduct,
  calculateEffectivePrice,
};

export default {
  getProductAddPage,
  saveImage,
  addProducts,
  getAllProducts,
  addProductOffer,
  removeProductOffer,
  blockProduct,
  unblockProduct,
  getEditProduct,
  editProduct,
  deleteSingleImage,
  deleteProduct,
  calculateEffectivePrice,
};
