const Product = require("../../models/productSchema")
const Category = require("../../models/categorySchema")
const sharp = require("sharp")
const path = require("path")
const fs = require("fs")

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
      const { productName, description, brand, category, regularPrice, salePrice, quantity, color } = req.body;
      const files = req.files;

      // Check if files are uploaded
      if (!files || Object.keys(files).length === 0) {
          return res.status(400).json({ success: false, message: "Please upload at least one image" });
      }

      // Check if product already exists
      const productExists = await Product.findOne({ productName: productName });
      if (productExists) {
          return res.status(400).json({ success: false, message: "Product already exists, try another name" });
      }

      // Create the directory if it doesn't exist
      const uploadDir = path.join(__dirname, "../public/uploads/product-images");
      if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Store image file paths
      const imageFilenames = [];

      for (let key in files) {
          files[key].forEach(file => {
              const filePath = path.join(uploadDir, Date.now() + '-' + file.originalname);
              // Save file to disk
              fs.writeFileSync(filePath, file.buffer);
              // Add file path to the list (store only relative path)
              imageFilenames.push(`uploads/product-images/${path.basename(filePath)}`);
          });
      }

      // Create new product object
      const newProduct = new Product({
          productName,
          description,
          brand,
          category,
          regularPrice,
          salePrice,
          quantity,
          color,
          productImage: imageFilenames, // Store the relative paths of images
          status: "available", // Default status
      });

      await newProduct.save();
      return res.status(200).json({ success: true, message: "Product added successfully" });
  } catch (error) {
      console.error("Error saving product:", error);
      return res.status(500).json({ success: false, message: "Error saving product" });
  }
};

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



const addProductOffer = async (req, res) => {
  try {
      const { productId, percentage } = req.body;
      const product = await Product.findById(productId);

      if (!product) {
          return res.status(404).json({ status: false, message: "Product not found" });
      }

      product.productOffer = parseInt(percentage);
      product.salePrice = Math.round(product.regularPrice * (1 - percentage / 100));
      await product.save();

      res.json({ status: true, message: "Offer added successfully" });
  } catch (error) {
      console.error("Error in addProductOffer:", error);
      res.status(500).json({ status: false, message: "Internal server error" });
  }
};

const removeProductOffer = async (req, res) => {
  try {
      const { productId } = req.body;
      const product = await Product.findById(productId);

      if (!product) {
          return res.status(404).json({ status: false, message: "Product not found" });
      }

      product.productOffer = 0;
      product.salePrice = product.regularPrice;
      await product.save();

      res.json({ status: true, message: "Offer removed successfully" });
  } catch (error) {
      console.error("Error in removeProductOffer:", error);
      res.status(500).json({ status: false, message: "Internal server error" });
  }
};

const blockProduct = async (req,res) => {
  try {

    let id = req.query.id;
    await Product.updateOne({_id:id},{$set:{isBlocked:true}});
    res.redirect("/admin/products")
    
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

const getEditProduct = async (req,res) => {
  try {
    
    const id = req.query.id;
    const product = await Product.findOne({_id:id})
    const category = await Category.find({});

    res.render("product-edit",{
      product:product,
      cat:category,
      // brand:brand
    })

  } catch (error) {

    res.redirect("/pageerror")
    
  }
}



module.exports = {
  getProductAddPage,
  saveImage,
  addProducts,
  getAllProducts,
  addProductOffer,
  removeProductOffer,
  blockProduct,
  unblockProduct,
  getEditProduct,


}

