import express from 'express';
const app = express();
import path from 'path';
import session from 'express-session';
import passport from './config/passport.js';
import 'dotenv/config';
import connectDB from './config/db.js';
import userRouter from './routes/userRoutes.js';
import adminRouter from './routes/adminRoutes.js';
import hbs from 'hbs';
import MongoStore from "connect-mongo";
import { checkBlockedUser } from "./middlewares/profileAuth.js";
import User from "./models/userSchema.js";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

connectDB();

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
      secret: "keyboard cat",
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
      cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
    }),
  )
  
  app.use(passport.initialize());
  app.use(passport.session());


  app.use((req, res, next) => {
    res.locals.user = req.session.googleUser || req.session.user || null; // Prioritize Google user, else normal user
    res.locals.admin = req.session.admin || null; // Keep admin session separate
    next();
});



app.use((req,res,next) => {
    res.set('Cache-Control','no-store')
    next();
})




app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')]);
app.set('view cache', true);
app.use(express.static(path.join(__dirname, 'public')));


app.use('/admin', adminRouter);

app.use('/',userRouter);




app.use(async (req, res, next) => {
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
});



const PORT = process.env.PORT || 3999;
app.listen(PORT, () => {
    console.log('Server is running on port http://localhost:3999');
})


export default app;