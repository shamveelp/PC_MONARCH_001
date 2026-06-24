import logger from '../utils/logger.js';
import { userBlockedEmitter } from "../controllers/admin/customerController.js";
import User from "../models/userSchema.js";

import STATUS_CODES from '../enums/statusCodes.js';
import MESSAGES from '../enums/constants.js';

const userAuth = (req, res, next) => {
    if (req.session.user) {
      User.findById(req.session.user)
        .then((user) => {
          if (user && !user.isBlocked) {
            next()
          } else {
            delete req.session.user
            res.redirect("/login")
          }
        })
        .catch((error) => {
          logger.info(MESSAGES.USER_AUTH_ERROR, error)
          res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send(MESSAGES.INTERNAL_SERVER_ERROR)
        })
    } else {
      res.redirect("/login")
    }
  }

  const addCartWishlist = (req, res, next) => {
    if (!req.session.user) {
      res.redirect("/login")

    }
  }

  userBlockedEmitter.on("userBlocked", (userId) => {
    logger.info(`User ${userId} has been blocked. Their session should be cleared.`)
  })
  
  

const adminAuth = (req, res, next) => {
    if (req.session.admin) {
        User.findById(req.session.admin)
        .then(admin => {
            if (admin && admin.isAdmin) { 
                next();
            } else {
                req.session.destroy();  // Clear invalid session
                res.redirect('/admin/login');
            }
        })
        .catch(error => {
            logger.error(MESSAGES.ADMIN_AUTH_ERROR, error);
            res.redirect('/admin/login');
        });
    } else {
        res.redirect('/admin/login');
    }
};


const checkUserAuthWish = (req, res, next) => {
  if (req.session.user) {
      next(); // User is logged in, proceed to next function
  } else {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ status: false, message: MESSAGES.USER_NOT_LOGGED_IN });
  }
};


const ajaxAuth = (req, res, next) => {
  if (req.session.user) {
    User.findById(req.session.user)
      .then((user) => {
        if (user && !user.isBlocked) {
          next();
        } else {
          delete req.session.user;
          res.status(STATUS_CODES.UNAUTHORIZED).json({ 
            status: false, 
            message: MESSAGES.USER_IS_BLOCKED_OR_NOT_FOUND 
          });
        }
      })
      .catch((error) => {
        logger.info(MESSAGES.AJAX_AUTH_ERROR, error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ 
          status: false, 
          message: MESSAGES.INTERNAL_SERVER_ERROR_1 
        });
      });
  } else {
    res.status(STATUS_CODES.UNAUTHORIZED).json({ 
      status: false, 
      message: MESSAGES.USER_NOT_LOGGED_IN 
    });
  }
};


export {
    userAuth,
    adminAuth,
    addCartWishlist,
    checkUserAuthWish,
    ajaxAuth
}