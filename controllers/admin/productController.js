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
    res.redirect("/admin/pageerror")
  }
}

const addProducts = async (req, res) => {
  try {
    const products = req.body
    const files = req.files

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "Please upload at least one image" })
    }

    // Process and save images
    const images = await Promise.all(
      files.map(async (file, index) => {
        const filename = `product-${Date.now()}-${index}.webp`
        const filepath = path.join(__dirname, "../../public/uploads/product-images", filename)

        await sharp(file.buffer).webp({ quality: 80 }).toFile(filepath)

        return filename
      }),
    )

    // Check if product already exists
    const productExists = await Product.findOne({ productName: products.productName })
    if (productExists) {
      return res.status(400).json({ message: "Product already exists, try another name" })
    }

    // Get category ID
    const category = await Category.findOne({ name: products.category })
    if (!category) {
      return res.status(400).json({ message: "Invalid category name" })
    }

    // Create new product
    const newProduct = new Product({
      productName: products.productName,
      description: products.description,
      category: category._id,
      regularPrice: products.regularPrice,
      salesPrice: products.salesPrice,
      createdOn: new Date(),
      quantity: products.quantity,
      color: products.color,
      productImage: images,
      status: "Available",
    })

    await newProduct.save()
    return res.redirect("/admin/addProducts")
  } catch (error) {
    console.error("Error saving product:", error)
    return res.redirect("/admin/pageerror")
  }
}

module.exports = {
  getProductAddPage,
  addProducts,
}

