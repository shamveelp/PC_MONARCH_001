const express = require('express');
const app = express();
const path = require('path');
const session = require('express-session');
const passport = require('./config/passport');
const env = require('dotenv').config();
const connectDB = require('./config/db');
const userRouter = require('./routes/userRoutes');
const adminRouter = require('./routes/adminRoutes');
const hbs = require('hbs');
const MongoStore = require("connect-mongo")
const checkBlockedUser = require("./middlewares/profileAuth");





connectDB();

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
    res.locals.user = req.user
    next()
  })

app.use((req,res,next) => {
    res.set('Cache-Control','no-store')
    next();
})




app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')]);
app.use(express.static(path.join(__dirname, 'public')));


app.use('/',userRouter);

app.use('/admin', adminRouter);



const PORT = process.env.PORT || 3999;
app.listen(PORT, () => {
    console.log('Server is running on port http://localhost:3999');
})


module.exports = app;