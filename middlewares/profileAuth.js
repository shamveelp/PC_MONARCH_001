import logger from '../utils/logger.js';
import User from "../models/userSchema.js";

import STATUS_CODES from '../enums/statusCodes.js';
import MESSAGES from '../enums/constants.js';

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
        logger.error(MESSAGES.ERROR_CHECKING_BLOCKED_USER, error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send(MESSAGES.SERVER_ERROR);
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