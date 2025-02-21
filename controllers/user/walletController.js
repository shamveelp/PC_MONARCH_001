const User = require("../../models/userSchema")



const loadWallet = async (req,res) => {
    try {
        
        res.render("wallet")

    } catch (error) {
        
    }
}




module.exports = {
    loadWallet,
    
}

