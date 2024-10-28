import winston from 'winston';
import path from 'path';
import fs from 'fs';

const logDirectory = path.join(process.cwd(), 'logs');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: path.join(logDirectory, 'error.log'),
            level: 'error',
        }),
        new winston.transports.File({
            filename: path.join(logDirectory, 'combined.log'),
        }),
    ],
});

if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
}

export default logger;
