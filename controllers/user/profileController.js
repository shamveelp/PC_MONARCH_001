const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const env = require("dotenv").config();
const session = require("express-session")

function generateOtp(){
    const digits = "1234567890"
    let otp = "";
    for(let i=0;i<6;i++){
        otp+=digits[Math.floor(Math.random()*10)]
    }
    return otp 
}

const sendVerificationEmail = async (email,otp) => {
    try {
        
        const transporter = nodemailer.createTransport({
            service:"gmail",
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD,
            }
        })

        const mailOption = {
            from: process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Your OTP for password reset",
            text:`Your OTP is ${otp}`,
            html:`<b><h4>Your OTP : ${otp}</h4><br></b>`,

        }

        const info = await transporter.sendMail(mailOption);
        console.log("Email sent:",info.messageId)

        return true;

    } catch (error) {

        console.error("error sending email",error);
        return false
        
    }
}


const securePassword = async (password) => {
    try {
        
        const passwordHash = await bcrypt.hash(password,10);
        return passwordHash

    } catch (error) {

        
    }
}



const getForgotPassPage = async (req,res) => {
    try {
        
        res.render("forgot-password");

    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
}

const forgotEmailValid = async (req,res) => {
    try {
        
        const {email} = req.body;
        const findUser = await User.findOne({email:email});
        if(findUser){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp = otp;
                req.session.email = email;
                res.render("forgotPass-otp");
                
                console.log("OTP: ",otp)
            } else{
                res.json({success:false,message:"Failed to send OTP. PLease try again"})
            }

        } else{
            res.render("forgot-password",{
                message:"User with this email does not exist"
            })
        }

    } catch (error) {

        res.redirec("/pageNotFound")
        
    }
}

const verifyForgotPassOtp = async (req,res) => {
    try {
        
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            req.session.resetAllowed = true;
            res.json({success:true,redirectUrl:"/reset-password"})
        } else{
            res.json({success:false,message:"OTP not matching"})
        }

    } catch (error) {

        res.status(500).json({success:false,message:"An error occured please try again"})
        
    }
}

const getResetPassPage = async (req,res) => {
    try {
        
        res.render("reset-password")

    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
}

const resendOtp = async (req,res) => {
    try {
        
        const otp = generateOtp();
        req.session.userOtp = otp;
        const email = req.session.email;
        console.log("Resending otp to email",email);
        const emailSent = await sendVerificationEmail(email,otp);
        if(emailSent){
            console.log("Resend Otp: ",otp);
            res.status(200).json({success:true,message:"Resend OTP Successful"})

            
        }

    } catch (error) {

        console.error("Error in rend otp",error);
        res.status(500).json({success:false,message:"Internal server errro"})
        
    }
}

const postNewPassword = async (req,res) => {
    try {
        
        const {newPass1, newPass2} = req.body;
        const email = req.session.email;

        if(newPass1 === newPass2){
            const passwordHash = await securePassword(newPass1);
            await User.updateOne(
                {email:email},
                {$set:{password:passwordHash}}
            );


            req.session.userOtp = null;
            req.session.email = null;
            req.session.resetAllowed = null;
            
            res.redirect("/login")
        } else{
            res.render("reset-password",{message:"Password do not match"})
        }

    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
}


const userProfile = async (req,res) => {
    try {
        
        const userId = req.session.user;
        const userData = await User.findById(userId);
        res.render("profile",{
            user:userData,

        })

        console.log(userData.email);
        

    } catch (error) {

        console.error('Error:',error)
        res.redirect("/pageNotFound")
        
    }
}

const loadResetPassword = async (req,res) => {
    try {
        
        res.render("user-resetPassword")

    } catch (error) {
        
    }
}



const loadAddressPage = async (req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const addressData = await Address.findOne({userId:userId})
        
        res.render("address",{
            user:userData,
            userAddress:addressData,

        })

    } catch (error) {

        console.error("Error in Address loading",error);
        res.redirect("/pageNotFound");
        
    }
}

const addAddress = async (req,res) => {
    try {
        
        const user = req.session.user;
        const userData = await User.findById(user);
        res.render("add-address",{
            
            theUser:user,
            user:userData
        })

    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
}

const postAddAddress = async (req,res) => {
    try {
        
        const userId = req.session.user;
        const userData = await User.findOne({_id:userId})
        const { addressType, name, country, city, landMark, state, streetAddress, pincode, phone, email, altPhone } = req.body;

        const userAddress = await Address.findOne({userId:userData._id});
        
        if(!userAddress){
            const newAddress = new Address({
                userId:userData,
                address: [{addressType, name, country, city, landMark, state, streetAddress, pincode, phone, email, altPhone}]

            });
            await newAddress.save();
        }else{
            userAddress.address.push({addressType, name, country, city, landMark, state, streetAddress, pincode, phone, email, altPhone})
            await userAddress.save();
        }

        res.redirect("/address")

    } catch (error) {

        console.error("Error adding address",error)

        res.redirect("/pageNotFound")
        
    }
}

const editAddress = async (req,res) => {
    try {
        
        const addressId = req.query.id;
        const user = req.session.user;
        const currAddress = await Address.findOne({
            "address._id":addressId,

        });
        if(!currAddress){
            return res.redirect("/pageNotFound")
        }

        const addressData = currAddress.address.find((item) => {
            return item._id.toString() === addressId.toString();

        })

        if(!addressData){
            return res.redirect("/pageNotFound")
        }

        res.render("edit-address",{
            address:addressData,
            user:user
        })

    } catch (error) {

        console.error("Error in edit Address",error)
        res.redirect("/pageNotFound")
        
    }
}


const postEditAddress = async (req,res) => {
    try {

        const data = req.body;
        const addressId = req.query.id;
        const user = req.session.user;
        const findAddress = await Address.findOne({
            "address._id":addressId
        });
        if(!findAddress){
            res.redirect("/pageNotFound")
        }
        await Address.updateOne(
            {"address._id":addressId},
            {$set:{
                "address.$":{
                    _id:addressId,
                    addressType:data.addressType,
                    name:data.name,
                    country:data.country,
                    city:data.city,
                    landMark:data.landMark,
                    state:data.state,
                    streetAddress:data.streetAddress,
                    pincode:data.pincode,
                    phone:data.phone,
                    email:data.email,
                    altPhone:data.altPhone
                }
            }}
        )

        res.redirect("/address")
        
    } catch (error) {

        console.error("Error in editing address",error)
        res.redirect("/pageNotFound")
        
    }
}

const deleteAddress = async (req,res) => {
    try {
        
        const addressId = req.query.id;
        const findAddress = await Address.findOne({"address._id":addressId})

        if(!findAddress){
            return res.status(404).send("Address Not Found")
        }

        await Address.updateOne(
        {
            "address._id":addressId
        },
        {
            $pull: {
                address:{
                    _id:addressId,
                }
            }
        })

        res.redirect("/address")

    } catch (error) {

        console.error("Error in deleting in address",error)
        res.redirect("/pageNotFound")
        
    }
}






module.exports = {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
    userProfile,
    loadResetPassword,
    loadAddressPage,
    addAddress,
    postAddAddress,
    editAddress,
    postEditAddress,
    deleteAddress,




}