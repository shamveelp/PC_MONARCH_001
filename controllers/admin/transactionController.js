

const loadTransactionsPage = async (req, res) => {
    try {

        res.render("transactions")
        
    } catch (error) {
        
    }
}


const getTransactionDetails = async (req, res) => {
    try {

        res.render("transaction-details")
        
    } catch (error) {
        
    }
}


module.exports = {
    loadTransactionsPage,
    getTransactionDetails,


}