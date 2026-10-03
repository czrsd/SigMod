import jwt from 'jsonwebtoken';
import { JWTPayload_accessToken, JWTPayload_refreshToken } from '../types';

const getSigningKey = (): string => {
    return process.env.JWT_PRIVATE_KEY || 'default_sigmod_development_jwt_secret_key_32chars';
};

const getVerificationKey = (): string => {
    return process.env.JWT_PUBLIC_KEY || process.env.JWT_PRIVATE_KEY || 'default_sigmod_development_jwt_secret_key_32chars';
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
        algorithms: ['RS256', 'HS256'],
    }) as JWTPayload_accessToken;
};

export const verifyRefreshToken = (token: string): JWTPayload_refreshToken => {
    return jwt.verify(token, getVerificationKey(), {
        algorithms: ['RS256', 'HS256'],
    }) as JWTPayload_refreshToken;
};
