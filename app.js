const express = require('express');
const app = express();
const path = require('path');
const session = require('express-session');
const env = require('dotenv').config();
const connectDB = require('./config/db');

connectDB();

app.listen(process.env.PORT, () => {
    console.log('Server is running on port http://localhost:3999');
})