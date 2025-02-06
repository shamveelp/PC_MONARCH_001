const User = require('../../models/userSchema');
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema")
const Brand = require("../../models/brandSchema")
const env = require('dotenv').config();
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');





const pageNotFound = async (req, res) => {
    try {
        res.render('page404')

    } catch (error) {
        res.redirect('/pagenotfound')
    }
}


const loadHomePage = async (req, res) => {
    try {
        const user = req.session.user;
        const categories = await Category.find({isListed:true})
        let productData = await Product.find({
            isBlocked:false,
            category:{$in:categories.map(category=>category._id)},
            quantity:{$gt:0},
        })

        productData.sort((a,b) => new Date(b.createdOn)-new Date(a.createdOn))
        productData = productData.slice(0,4);


        if(user){
            const userData = await User.findOne({_id:user});
            res.render('home',{user:userData, products:productData})
            
            
        } else{
            return res.render('home',{products:productData,req:req})
        }
            
        
    } catch (error) {
        console.log('Home Page Not Found')
        res.status(500).send('Server Error')
    }
}

const loadSignUpPage = async (req, res) => {
    try {
        res.render('signup')
    } catch (error) {
        console.log('Sign Up Page Not Found')
        res.status(500).send('Server Error')
    }
}






function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email,otp){
    try{
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from: process.env.NODEMAIL_EMAIL,
            to: email,
            subject: 'OTP for Verification',
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP is ${otp}</b>`
        })

        return info.accepted.length > 0



    } catch (error) {
        console.error("Error for sending email",error)
        return false
    }
}



const signUp = async (req, res) => {
   
    try {
        const { name, email, phone, password, cPassword } = req.body
        
        if(password !== cPassword){
            return res.render('signup',{message:'Password not matched'})
        }

        const findUser = await User.findOne({email:email})

        if(findUser){
            return res.render('signup',{message:'User already exists'})
        }

        const otp = generateOTP()

        const emailSent = await sendVerificationEmail(email,otp);

        if(!emailSent){
            return res.json("email-error")
        }
        
        req.session.userOtp = otp;
        req.session.userData = {name,phone,email,password};

        res.render('verify-otp');
        console.log("OTP Send",otp);
        

    } catch (error) {
        console.error('signup error',error)
        res.redirect('/pagenotfound')
    }
}

const securePassword = async (password) => {
    try {
        
        const passwordHash = await bcrypt.hash(password,10);

        return passwordHash;

    } catch (error) {
        
    }
}


const verifyOtp = async (req, res) => {
    try{
        const {otp} = req.body;

        console.log('OTP',otp)

        if(otp===req.session.userOtp){
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);

            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                googleId: user.googleId || null,
                password: passwordHash
            })

            await saveUserData.save();
            req.session.user = saveUserData._id;

            res.json({success:true,redirectUrl:'/'})

        } else{
            res.status(400).json({success:false,message:'Invalid OTP Please try again'})
        }

    } catch (error) {
        console.error('Error verifying OTP',error)
        res.status(500).json({success:false,message:'Server Error'})
    }
}


const resendOtp = async (req, res) => {
    try {
        
        const {email} = req.session.userData;
        if(!email){
            return res.status(400).json({success:false,message:'Email not found in session'})
        }

        const otp = generateOTP();

        req.session.userOtp = otp;

        const emailSent = await sendVerificationEmail(email,otp);

        if(!emailSent){
            console.log("Resend OTP",otp);
            res.status(200).json({success:true,message:'OTP Resend Successfully'})
            
        } else{
            res.status(500).json({success:false,message:'Failed to resend OTP Please try again'})
        }

    } catch (error) {

        console.error('Error Resending OTP',error)
        res.status(500).json({success:false,message:'INternal Server Error, Please try again'})
        
    }
}

const loadLoginPage = async (req, res) => {
    try {
        if(!req.session.user){
            return res.render('login')
        } else{
            res.redirect('/')
        }
    } catch (error) {
        res.redirect('/pagenotfound')
    }
}


const login = async (req, res) => {
    try {
        
        const {email,password} = req.body;

        const findUser = await User.findOne({isAdmin:0,email:email});

        if(!findUser){
            return res.render('login',{message:'User not found'})
        }
        if(findUser.isBlocked){
            return res.render('login',{message:'User is Blocked by Admin'})
        }

        const passwordMatch = await bcrypt.compare(password,findUser.password);

        if(!passwordMatch){
            return res.render('login',{message:'Invalid Password'})
        }

        req.session.user = findUser._id;
        res.redirect('/')

    } catch (error) {

        console.error('Login Error',error);
        res.render('login',{message:'Login Failed Try again'})
        
        
    }
}


const logout = async (req, res) => {
    try {
        if (req.session.user) {
            delete req.session.user; // ✅ Remove only user session
        }
        res.redirect('/login'); // Redirect user to login page
    } catch (error) {
        console.log('Logout Error', error);
        res.redirect('/pagenotfound');
    }
};


// const loadShoppingPage = async (req,res) => {
//     try {

//         const user = req.session.user;
//         const userData = await User.findOne({_id:user});
//         const categories = await Category.find({isListed:true});

//         const categoriesWithCounts = await Promise.all(categories.map(async (category) => {
//             const count = await Product.countDocuments({ 
//                 category: category._id, 
//                 isBlocked: false, 
//                 quantity: { $gt: 0 } 
//             });
//             return { _id: category._id, name: category.name, productCount: count };
//         }));
    

//         const categoryIds = categories.map((category) => category._id.toString());
//         const page = parseInt(req.query.page) || 1;
//         const limit = 9;
//         const skip = (page-1)*limit;
//         const products = await Product.find({
//             isBlocked:false,
//             category:{$in:categoryIds},
//             quantity:{$gt:0},

//         }).sort({createdOn:-1}).skip(skip).limit(limit)

//         const totalProducts = await Product.countDocuments({
//             isBlocked:false,
//             category:{$in:categoryIds},
//             quantity:{$gt:0},

//         })

//         const totalPages = Math.ceil(totalProducts/limit);

//         // const brands = await Brand.find({isBlocked:false});

//         const categoriesWithIds = categories.map(category => ({_id:category._id,name:category.name}));

        
//         res.render("shop",{
//             user:userData,
//             products:products,
//             category:categoriesWithIds,
//             // brand:brands,
//             totalProducts:totalProducts,
//             currentPage:page,
//             totalPages:totalPages
//         })

//     } catch (error) {

//         res.redirect("/pageNotFound")
        
//     }
// }

const loadShoppingPage = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });

        const categories = await Category.find({ isListed: true });

        // Fetch product count for each category
        const categoriesWithCounts = await Promise.all(categories.map(async (category) => {
            const count = await Product.countDocuments({ 
                category: category._id, 
                isBlocked: false, 
                quantity: { $gt: 0 } 
            });
            return { _id: category._id, name: category.name, productCount: count };
        }));

        // const totalProductCount = await Product.countDocuments({});
        // console.log("Total Products:", totalProductCount);


        const categoryIds = categories.map(category => category._id.toString());

        const page = parseInt(req.query.page) || 1;
        const limit = 9;
        const skip = (page - 1) * limit;

        const products = await Product.find({
            isBlocked: false,
            category: { $in: categoryIds },
            quantity: { $gt: 0 },
        })
        .sort({ createdOn: -1 })
        .skip(skip)
        .limit(limit);

        const totalProducts = await Product.countDocuments({
            isBlocked: false,
            category: { $in: categoryIds },
            quantity: { $gt: 0 },
        });

        const totalPages = Math.ceil(totalProducts / limit);

        res.render("shop", {
            user: userData,
            products: products,
            category: categoriesWithCounts, // Updated category data
            totalProducts: totalProducts,
            currentPage: page,
            totalPages: totalPages,
            req:req
            // totalProductCount
        });

    } catch (error) {
        console.error("Error loading shopping page:", error);
        res.redirect("/pageNotFound");
    }
};

const filterProduct = async (req,res) => {
    try {

        const user = req.session.user;
        const category = req.query.category;
        const findCategory = category ? await Category.findOne({_id:category}) : null;

        const query = {
            isBlocked:false,
            quantity:{$gt:0},

        }
        if(findCategory){
            query.category = findCategory._id;
        }

        let findProducts = await Product.find(query).lean();
        findProducts.sort((a,b) => new Date(b.createdOn) - new Date(a.createdOn));

        const categories = await Category.find({isListed:true});

        const categoriesWithCounts = await Promise.all(categories.map(async (category) => {
            const count = await Product.countDocuments({ 
                category: category._id, 
                isBlocked: false, 
                quantity: { $gt: 0 } 
            });
            return { _id: category._id, name: category.name, productCount: count };
        }));

        let itemsPerPage = 6;

        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(findProducts.length / itemsPerPage);
        const currentProduct = findProducts.slice(startIndex,endIndex);

        let userData = null;
        if(user){
            userData = await User.findOne({_id:user});
            if(userData){
                const searchEntry = {
                    category: findCategory ? findCategory._id :null,
                    searchedOn: new Date()

                }
                userData.searchHistory.push(searchEntry)
                await userData.save();
            }
        }

        req.session.filteredProducts = currentProduct;

        res.render("shop",{

            user:userData,
            products:currentProduct,
            category:categoriesWithCounts,
            totalPages,
            currentPage,
            selectedCategory: category || null,
            // totalProductCount,

        })


        
    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
}




module.exports = {
    loadHomePage,
    pageNotFound,
    loadLoginPage,
    loadSignUpPage,
    signUp,
    login,
    verifyOtp,
    resendOtp,
    logout,
    loadShoppingPage,
    filterProduct,




    
}