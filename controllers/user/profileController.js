import logger from '../../utils/logger.js';
import User from "../../models/userSchema.js";
import Address from "../../models/addressSchema.js";
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";
import 'dotenv/config';
import session from "express-session";
import multer from "multer";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { uploadBuffer, cloudinary } from "../../config/cloudinary.js";


import STATUS_CODES from '../../enums/statusCodes.js';
import MESSAGES from '../../enums/constants.js';

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
        logger.info(MESSAGES.EMAIL_SENT,info.messageId)

        return true;

    } catch (error) {

        logger.error(MESSAGES.ERROR_SENDING_EMAIL,error);
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
                
                logger.info(MESSAGES.OTP,otp)
            } else{
                res.json({success:false,message: MESSAGES.FAILED_TO_SEND_OTP_PLEASE_TRY_AGAIN})
            }

        } else{
            res.render("forgot-password",{
                message: MESSAGES.USER_WITH_THIS_EMAIL_DOES_NOT_EXIST
            })
        }

    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
}

const verifyForgotPassOtp = async (req,res) => {
    try {
        
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            req.session.resetAllowed = true;
            res.json({success:true,redirectUrl:"/reset-password"})
        } else{
            res.json({success:false,message: MESSAGES.OTP_NOT_MATCHING_2})
        }

    } catch (error) {

        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({success:false,message: MESSAGES.AN_ERROR_OCCURED_PLEASE_TRY_AGAIN})
        
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
        logger.info(MESSAGES.RESENDING_OTP_TO_EMAIL,email);
        const emailSent = await sendVerificationEmail(email,otp);
        if(emailSent){
            logger.info(MESSAGES.RESEND_OTP,otp);
            res.status(STATUS_CODES.OK).json({success:true,message: MESSAGES.RESEND_OTP_SUCCESSFUL})

            
        }

    } catch (error) {

        logger.error(MESSAGES.ERROR_IN_REND_OTP,error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({success:false,message: MESSAGES.INTERNAL_SERVER_ERRRO})
        
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
            res.render("reset-password",{message: MESSAGES.PASSWORD_DO_NOT_MATCH})
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

        // logger.info(userData.email);
        

    } catch (error) {

        logger.error(MESSAGES.ERROR,error)
        res.redirect("/pageNotFound")
        
    }
}


const changeEmail = async (req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        res.render("change-email",{
            user:userData
        })

    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
}

const changeEmailValid = async (req,res) => {
    try {
        
        const {email} = req.body;
        const userExist = await User.findOne({email});
        if(userExist){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp)
            if(emailSent) {
                req.session.userOtp = otp;
                req.session.userdata = req.body;
                req.session.email = email;
                res.render("change-email-otp");
                logger.info(`Email Sent : ${email}, Otp: ${otp}`)
            }else {
                res.json("email-error")
            }
        }else{
            res.render("change-email",{
                message: MESSAGES.USER_WITH_EMAIL_NOT_EXIST
            })
        }

    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
}

const verifyEmailOtp = async (req,res) => {
    try {

        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            req.session.userData = req.body.userData;
            res.render("new-email",{
                userData: req.session.userData,
            })
        }else{
            res.render("change-email-otp",{
                message: MESSAGES.OTP_NOT_MATCHING,
                userData: req.session.userData,
            })
        }
        
    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
}

const updateEmail = async (req,res) => {
    try {
        
        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        await User.findByIdAndUpdate(userId,{
            email:newEmail,
        })
        res.redirect("/userProfile")

    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
}


  const updateProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        const { name, username, phone } = req.body;

        // Validate phone number
        const phoneRegex = /^\d{10}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: MESSAGES.PLEASE_ENTER_A_VALID_10_DIGIT_PHONE_NUMBER
            });
        }

        // Check if username is already taken
        if (username) {
            const existingUser = await User.findOne({
                username,
                _id: { $ne: userId }
            });
            if (existingUser) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({
                    success: false,
                    message: MESSAGES.USERNAME_IS_ALREADY_TAKEN_PLEASE_CHOOSE_A_DIFFEREN
                });
            }
        }

        // Update user profile
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { name, username, phone },
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            return res.status(STATUS_CODES.NOT_FOUND).json({
                success: false,
                message: MESSAGES.USER_NOT_FOUND
            });
        }

        res.json({
            success: true,
            message: MESSAGES.PROFILE_UPDATED_SUCCESSFULLY
        });
    } catch (error) {
        logger.error(MESSAGES.ERROR_UPDATING_PROFILE, error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGES.AN_ERROR_OCCURRED_WHILE_UPDATING_YOUR_PROFILE
        });
    }
};

  

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const userId = req.session.user;
        

        
        if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.PASSWORD_MUST_BE_AT_LEAST_8_CHARACTERS_LONG_AND_CO });
        }

        if (newPassword !== confirmPassword) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.PASSWORDS_DO_NOT_MATCH });
        }

        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.USER_NOT_FOUND_4 });
        }

        // Check if the current password is correct
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, error: 'current_password_incorrect', message: MESSAGES.CURRENT_PASSWORD_IS_INCORRECT });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the user's password
        user.password = hashedPassword;
        await user.save();

        res.json({ success: true, message: MESSAGES.PASSWORD_CHANGED_SUCCESSFULLY });
    } catch (error) {
        logger.error(MESSAGES.ERROR_CHANGING_PASSWORD, error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.AN_ERROR_OCCURRED_WHILE_CHANGING_THE_PASSWORD });
    }
};
  



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

        logger.error(MESSAGES.ERROR_IN_ADDRESS_LOADING,error);
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

        logger.error(MESSAGES.ERROR_ADDING_ADDRESS,error)

        res.redirect("/pageNotFound")
        
    }
}

const editAddress = async (req,res) => {
    try {
        
        const addressId = req.query.id;
        const userId = req.session.user;
        const userData = await User.findById(userId);
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
            user:userData
        })

    } catch (error) {

        logger.error(MESSAGES.ERROR_IN_EDIT_ADDRESS,error)
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

        logger.error(MESSAGES.ERROR_IN_EDITING_ADDRESS,error)
        res.redirect("/pageNotFound")
        
    }
}

const deleteAddress = async (req,res) => {
    try {
        
        const addressId = req.query.id;
        const findAddress = await Address.findOne({"address._id":addressId})

        if(!findAddress){
            return res.status(STATUS_CODES.NOT_FOUND).send("Address Not Found")
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

        logger.error(MESSAGES.ERROR_IN_DELETING_IN_ADDRESS,error)
        res.redirect("/pageNotFound")
        
    }
}


const updateProfileImage = async (req, res) => {
    try {
        const userId = req.session.user;
        const file = req.file;

        if (!file) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: MESSAGES.NO_IMAGE_PROVIDED });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: MESSAGES.USER_NOT_FOUND });
        }

        // Process image with sharp
        const processedBuffer = await sharp(file.buffer)
            .resize(400, 400, { fit: 'cover' })
            .webp({ quality: 80 })
            .toBuffer();

        // Upload to Cloudinary
        const uploadResult = await uploadBuffer(processedBuffer, 'profile-pictures');

        // Delete old image from Cloudinary if it exists
        if (user.profilePicture && user.profilePicture.startsWith('http')) {
            try {
                const publicId = user.profilePicture.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(`profile-pictures/${publicId}`);
            } catch (err) {
                logger.error(MESSAGES.ERROR_DELETING_OLD_PROFILE_IMAGE, err);
            }
        }

        // Update user profile
        user.profilePicture = uploadResult.secure_url;
        await user.save();

        res.json({
            success: true,
            message: MESSAGES.PROFILE_IMAGE_UPDATED_SUCCESSFULLY,
            imageUrl: uploadResult.secure_url
        });
    } catch (error) {
        logger.error(MESSAGES.ERROR_UPDATING_PROFILE_IMAGE, error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGES.AN_ERROR_OCCURRED_WHILE_UPDATING_YOUR_PROFILE_IMAG
        });
    }
};


export default {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
    userProfile,
    loadAddressPage,
    addAddress,
    postAddAddress,
    editAddress,
    postEditAddress,
    deleteAddress,
    updateProfile,
    changeEmail,
    changeEmailValid,
    verifyEmailOtp,
    updateEmail,
    changePassword,
    updateProfileImage,
}