
const pageNotFound = async (req, res) => {
    try {
        res.render('page404')

    } catch (error) {
        res.redirect('/pagenotfound')
    }
}


const loadHomePage = async (req, res) => {
    try {
        res.render('home')
    } catch (error) {
        console.log('Home Page Not Found')
        res.status(500).send('Server Error')
    }
}





module.exports = {
    loadHomePage,
    pageNotFound,
}