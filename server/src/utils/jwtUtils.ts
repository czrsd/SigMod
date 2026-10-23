import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { JWTPayload_accessToken, JWTPayload_refreshToken } from '../types';

const developmentKey = randomBytes(32).toString('hex');
const keyOrDevelopment = (key: string | undefined): string => {
    if (key && key !== 'default_sigmod_development_jwt_secret_key_32chars') return key;
    if (process.env.NODE_ENV === 'production') throw new Error('Production JWT key configuration is required.');
    return developmentKey;
};

const getSigningKey = (): string => keyOrDevelopment(process.env.JWT_PRIVATE_KEY);

const getVerificationKey = (): string => {
    return keyOrDevelopment(process.env.JWT_PUBLIC_KEY || process.env.JWT_PRIVATE_KEY);
};

export const validateJwtConfiguration = (): void => {
    const key = getSigningKey();
    getVerificationKey();
    if (getAlgorithm() === 'HS256' && Buffer.byteLength(key) < 32) {
        throw new Error('JWT signing keys must contain at least 32 bytes.');
    }
};

const getAlgorithm = (): jwt.Algorithm => {
    const key = getSigningKey();
    return key.includes('BEGIN RSA PRIVATE KEY') || key.includes('BEGIN PRIVATE KEY') ? 'RS256' : 'HS256';
};

export const generateAccessToken = (userId: string): string => {
    return jwt.sign({ userId, valid: true }, getSigningKey(), {
        algorithm: getAlgorithm(),
        expiresIn: '5m',
    });
};

export const generateRefreshToken = (userId: string): string => {
    return jwt.sign({ userId }, getSigningKey(), {
        algorithm: getAlgorithm(),
        expiresIn: '1y',
    });
};

export const verifyAccessToken = (token: string): JWTPayload_accessToken => {
    return jwt.verify(token, getVerificationKey(), {
        algorithms: [getAlgorithm()],
    }) as JWTPayload_accessToken;
};

export const verifyRefreshToken = (token: string): JWTPayload_refreshToken => {
    return jwt.verify(token, getVerificationKey(), {
        algorithms: [getAlgorithm()],
    }) as JWTPayload_refreshToken;
};
