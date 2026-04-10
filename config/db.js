import logger from '../utils/logger.js';
import mongoose from 'mongoose';
import 'dotenv/config';

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info('MongoDB Connected');
    } catch (error){
        logger.info("DB Connection Error",error.message);
        process.exit(1);
    }
}

export default connectDB;