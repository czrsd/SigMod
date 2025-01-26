import jwt from 'jsonwebtoken';

export const generateAccessToken = (userId: string) => {
    return jwt.sign(
        { userId, valid: true },
        process.env.JWT_PRIVATE_KEY || '',
        {
            algorithm: 'RS256',
            expiresIn: '5m',
        }
    );
};

export const generateRefreshToken = (userId: string) => {
    return jwt.sign({ userId }, process.env.JWT_PRIVATE_KEY || '', {
        algorithm: 'RS256',
        expiresIn: '1y',
    });
};
