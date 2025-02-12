


const loadCheckoutPage = async (req,res) => {
    try {
        
        res.render("checkout")

    } catch (error) {

        console.error("Error",error)
        res.redirect("/pageNotFound")
        
    }
}



module.exports = {
    loadCheckoutPage,
    
}