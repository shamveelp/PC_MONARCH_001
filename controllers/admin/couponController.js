import logger from '../../utils/logger.js';
import Coupon from "../../models/couponSchema.js";
import mongoose from "mongoose";


import STATUS_CODES from '../../enums/statusCodes.js';
import MESSAGES from '../../enums/constants.js';

const loadCoupon = async (req,res) => {
    try {

        const findCoupons = await Coupon.find({}).sort({createdOn:-1})
        

        return res.render("coupon",{coupons:findCoupons})

    } catch (error) {
        return res.redirect("/pageerror")
        
    }
}

const createCoupon = async (req,res) => {
    try {
        
        
    const data = {
        couponName:req.body.couponName,
        startDate: new Date(req.body.startDate + "T00:00:00"),
        endDate: new Date(req.body.endDate + "T00:00:00"),
        offerPrice: parseInt(req.body.offerPrice),
        minimumPrice: parseInt(req.body.minimumPrice),
    }

    const newCoupon = new Coupon({
        name:data.couponName,
        createdOn: data.startDate,
        expireOn: data.endDate,
        offerPrice: data.offerPrice,
        minimumPrice: data.minimumPrice
    })

    await newCoupon.save()

    return res.redirect("/admin/coupon")

    } catch (error) {

        res.redirect("/pageerror")
        
    }
}

const editCoupon = async (req,res) => {
    try {

        const id = req.query.id;
        const findCoupon = await Coupon.findOne({_id:id});

        res.render("edit-coupon",{
            findCoupon:findCoupon,

        })
        
    } catch (error) {

        res.redirect("/pageerror")
        
    }
}

const updateCoupon = async (req, res) => {
    try {
        const couponId = req.query.couponId;
        if (!mongoose.Types.ObjectId.isValid(couponId)) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ message: MESSAGES.INVALID_COUPON_ID });
        }

        const oid = new mongoose.Types.ObjectId(couponId);
        const selectedCoupon = await Coupon.findOne({ _id: oid });

        if (!selectedCoupon) {
            return res.status(STATUS_CODES.NOT_FOUND).json({ message: MESSAGES.COUPON_NOT_FOUND });
        }

        const startDate = new Date(req.body.startDate + "T00:00:00");
        const endDate = new Date(req.body.endDate + "T00:00:00");

        const updatedCoupon = await Coupon.findByIdAndUpdate(
            { _id: oid },
            {
                $set: {
                    name: req.body.couponName,
                    createdOn: startDate,
                    expireOn: endDate,
                    offerPrice: parseInt(req.body.offerPrice),
                    minimumPrice: parseInt(req.body.minimumPrice)
                }
            },
            { new: true }
        );

        if (!updatedCoupon) {
            return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: MESSAGES.ERROR_UPDATING_COUPON });
        }

        res.json({ message: MESSAGES.COUPON_UPDATED_SUCCESSFULLY, coupon: updatedCoupon });
    } catch (error) {
        logger.error(MESSAGES.ERROR_UPDATING_COUPON_1, error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: MESSAGES.INTERNAL_SERVER_ERROR_1 });
    }
};

const deleteCoupon = async (req,res) => {
    try {
        
        const id = req.query.id;
        await Coupon.deleteOne({_id:id})
        res.status(STATUS_CODES.OK).send({success:true,message: MESSAGES.COUPON_DELETED_SUCCESSFULLY})

    } catch (error) {
        logger.error(MESSAGES.ERROR_DELETING_COUPON,error)
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send({success:false,message: MESSAGES.INTERNAL_SERVER_ERROR})
    }
}


export default {
    loadCoupon,
    createCoupon,
    editCoupon,
    updateCoupon,
    deleteCoupon,
}