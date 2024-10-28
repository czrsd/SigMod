import mongoose from 'mongoose';
import logger from '../utils/logger';

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI;

        if (!uri) {
            throw new Error('MongoDB URI is required');
        }

        await mongoose.connect(uri);
        logger.info('[MongoDB] Connected to MongoDB.');
    } catch (error) {
        logger.error('Error connecting to MongoDB: ', error);
    }
};

export default connectDB;
export const db = mongoose.connection;
