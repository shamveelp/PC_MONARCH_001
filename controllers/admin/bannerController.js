import Banner from "../../models/bannerSchema.js";
import path from "path";
import fs from "fs";


const getBannerPage = async (req,res) => {
    try {
        
        const findBanner = await Banner.find({})
        res.render("banner",{data:findBanner})

    } catch (error) {

        res.redirect("/pageerror")
        
    }
}


export default {
    getBannerPage
}