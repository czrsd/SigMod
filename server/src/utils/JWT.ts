import jwt from 'jsonwebtoken';

const privateKey = process.env.JWT_PRIVATE_KEY || '';
const publicKey = process.env.JWT_PUBLIC_KEY || '';

export function signJWT(payload: any, expiresIn: string | number) {
    return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn });
}

export function verifyJWT(token: string) {
    try {
        const decoded = jwt.verify(token, publicKey);
        return { payload: decoded, expired: false };
    } catch (error: any) {
        return {
            payload: null,
            expired: error.message.includes('jwt expired'),
        };
    }
}
