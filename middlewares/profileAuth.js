import User from "../models/userSchema.js";

const resetPasswordMiddleware = (req, res, next) => {
    if (req.session.resetAllowed) {
        return next();  
    } else {
        return res.redirect("/forgot-password");  
    }
};

const blockLoggedInUsers = (req, res, next) => {
    if (req.session.user) { 
        return res.redirect("/"); 
    }
    next();  
};

const checkBlockedUser = async (req, res, next) => {
    try {
        if (req.session.user) {
            const user = await User.findById(req.session.user);
            if (user && user.isBlocked) {
                delete req.session.user;
                return res.redirect('/login'); 
            }
        }
        next();
    } catch (error) {
        console.error("Error checking blocked user:", error);
        res.status(500).send('Server Error');
    }
};

function checkLoggedIn(req, res, next) {
    if (req.session.user) {
        return res.redirect('/'); 
    }
    next();
}

function forgotPassLogout(req, res, next) {
    if (req.session.user) {
        delete req.session.user;
        return res.redirect("/forgot-password"); 
    } else {
        next(); 
    }
}

export {
    resetPasswordMiddleware,
    blockLoggedInUsers,
    checkBlockedUser,
    checkLoggedIn,
    forgotPassLogout
}