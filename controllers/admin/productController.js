const Product = require("../../models/productSchema")
const Category = require("../../models/categorySchema")
const sharp = require("sharp")
const path = require("path")
const fs = require("fs").promises

const getProductAddPage = async (req, res) => {
  try {
    const category = await Category.find({ isListed: true })
    res.render("product-add", {
      cat: category,
    })
  } catch (error) {
    console.error("Error loading product add page:", error)
    res.status(500).json({ success: false, message: "Error loading product add page" })
  }
}

const saveImage = async (req, res) => {
  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ success: false, message: "No image file provided" })
    }

    const filename = file.originalname
    const filepath = path.join(__dirname, "../../public/uploads/product-images", filename)

    await sharp(file.buffer)
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(filepath)

    return res.status(200).json({ success: true, message: "Image saved successfully", filename: filename })
  } catch (error) {
    console.error("Error saving image:", error)
    return res.status(500).json({ success: false, message: "Error saving image" })
  }
}

const addProducts = async (req, res) => {
  try {
    const { productName, description, brand, category, regularPrice, salePrice, quantity, color } = req.body
    const files = req.files

    if (!files || Object.keys(files).length === 0) {
      return res.status(400).json({ success: false, message: "Please upload at least one image" })
    }

    // Check if product already exists
    const productExists = await Product.findOne({ productName: productName })
    if (productExists) {
      return res.status(400).json({ success: false, message: "Product already exists, try another name" })
    }

    // Create new product
    const newProduct = new Product({
      productName,
      description,
      brand,
      category,
      regularPrice,
      salePrice,
      quantity,
      color,
      productImage: Object.values(files).map((file) => file[0].filename),
      status: "available", // This matches the enum in your schema
    })

    await newProduct.save()
    return res.status(200).json({ success: true, message: "Product added successfully" })
  } catch (error) {
    console.error("Error saving product:", error)
    return res.status(500).json({ success: false, message: "Error saving product" })
  }
}

const getAllProducts = async (req,res) => {
  try {
    
    const search = req.query.search || "";
    const page = req.query.page ||  1;
    const limit = 4;

    const productData = await Product.find({
      $or:[
        {productName:{$regex:new RegExp(".*"+search+".*","i")}},
        {brand:{$regex:new RegExp(".*"+search+".*","i")}}
      ]
    }).limit(limit*1).skip((page -1)*limit).populate('category').exec();

    const count = await Product.find({
      $or:[
        {productName:{$regex:new RegExp(".*"+search+".*","i")}},
        {brand:{$regex:new RegExp(".*"+search+".*","i")}}

      ]
    }).countDocuments();

    const category = await Category.find({isListed:true});

    if(category){
      res.render("products",{
        data:productData,
        currentPage:page,
        totalPages:Math.ceil(count/limit),
        cat:category,
        // brand:brand,
      })
    } else{
      res.render("admin-error")
    }

  } catch (error) {

    res.render("admin-error")
    
  }
}

// const getAllProducts = async (req,res) => {
//   try {
//     res.render("products")
    
//   } catch (error) {
//     res.redirect("/pageerror")
    
//   }
// }

module.exports = {
  getProductAddPage,
  saveImage,
  addProducts,
  getAllProducts
}

