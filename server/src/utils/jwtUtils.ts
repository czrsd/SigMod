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
    const jti = jwt.sign({}, process.env.JWT_PRIVATE_KEY || '', {
        algorithm: 'RS256',
        expiresIn: '1y',
    });
    return jwt.sign({ userId, jti }, process.env.JWT_PRIVATE_KEY || '', {
        algorithm: 'RS256',
        expiresIn: '1y',
    });
};
