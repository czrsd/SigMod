import { Request, Response } from 'express';
import { validatePassword, validatePasswordMatch, validateUsername } from '../../utils/validation';
import bcrypt from 'bcryptjs';
import { generateAccessToken, generateRefreshToken } from '../../utils/jwtUtils';
import UserSettingsModel from '../../models/UserSettingsModel';
import AccountModel, { IAccount } from '../../models/AccountModel';
import { noXSS } from '../../utils/helpers';
import { modAccount, RegisterData } from '../../types';
import { wsHandler } from '../../socket/setup';
import passport from 'passport';
import logger from '../../utils/logger';
import { ensureAccountSettings } from '../../services/discordAccount';
import { timingSafeEqual } from 'crypto';
import { withAccountSession } from '../../services/accountSessions';

class AccountController {
    async register(req: Request, res: Response): Promise<Response | void> {
        try {
            const data: RegisterData = req.body;
            if (!data || Object.entries(data).length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No data provided.',
                });
            }

            let { username, password, confirmedPassword } = data;

            const validations = [
                {
                    validator: validateUsername,
                    field: username,
                    fieldName: 'Username',
                },
                {
                    validator: validatePassword,
                    field: password,
                    fieldName: 'Password',
                },
                {
                    validator: validatePasswordMatch,
                    fields: [password, confirmedPassword],
                    fieldName: 'Passwords',
                },
            ];

            const errors: { fieldName: string; message: string }[] = [];

            validations.forEach(({ validator, field, fields, fieldName }) => {
                let validationResult;

                if (fields) {
                    validationResult = validator(fields[0], fields[1]);
                } else {
                    validationResult = validator(field);
                }

                if (typeof validationResult === 'string') {
                    errors.push({ fieldName, message: validationResult });
                } else if (validationResult && typeof validationResult === 'object' && 'success' in validationResult) {
                    if (!validationResult.success) {
                        errors.push({
                            fieldName,
                            message: validationResult.message || 'Validation failed',
                        });
                    }
                }
            });

            if (errors.length > 0) {
                return res.status(400).json({
                    success: false,
                    errors,
                });
            }

            const existingUser = await AccountModel.findOne({ username });

            if (existingUser) {
                return res.json({
                    success: false,
                    errors: [
                        {
                            fieldName: 'Username',
                            message: 'Username already exists.',
                        },
                    ],
                });
            }

            username = noXSS(username);

            const hashedPassword = await bcrypt.hash(password, 10);

            const newUser = new AccountModel({
                username,
                password: hashedPassword,
                imageURL: 'https://czrsd.com/static/sigmod/SigMod25-rounded.png',
                role: 'Member',
                online: false,
                visible: true,
            });

            await newUser.save();

            const insertedUser: IAccount | null = await AccountModel.findOne({
                username,
            });

            if (!insertedUser) {
                return res.status(400).json({
                    success: false,
                    errors: [
                        {
                            fieldName: 'Unknown Error',
                            message: 'An unknown error has occurred. Please try again.',
                        },
                    ],
                });
            }

            const publicUser = insertedUser.toObject();
            delete publicUser.password;

            const defaultSettings = new UserSettingsModel({
                target: insertedUser._id,
                static_status: 'online',
                accept_requests: true,
                highlight_friends: true,
                highlight_color: '#433DA4',
            });

            await defaultSettings.save();

            const accessToken = generateAccessToken(insertedUser._id, insertedUser.session_version);
            const refreshToken = generateRefreshToken(insertedUser._id, insertedUser.session_version);

            res.cookie('mod_accessToken', accessToken, {
                maxAge: 300000,
                httpOnly: true,
                secure: true,
                sameSite: 'none',
            });

            res.cookie('mod_refreshToken', refreshToken, {
                maxAge: 3.154e10,
                httpOnly: true,
                secure: true,
                sameSite: 'none',
            });

            return res.status(201).json({
                success: true,
                message: 'User registered successfully.',
                accessToken,
                refreshToken,
                user: publicUser,
                settings: defaultSettings.toObject(),
            });
        } catch (err) {
            console.error('Error registering user:', err);
            return res.json({
                success: false,
                message: 'An error occurred while registering. Please try again later.',
            });
        }
    }

    async login(req: Request, res: Response): Promise<Response | void> {
        try {
            passport.authenticate(
                'local',
                async (
                    err: any,
                    user: {
                        user: modAccount;
                        accessToken: string;
                        refreshToken: string;
                    }
                ) => {
                    if (err) return res.status(503).json({ success: false, message: 'Login unavailable. Please try again.' });
                    if (!user) {
                        return res.status(400).json({
                            success: false,
                            message: 'Invalid credentials.',
                        });
                    }

                    try {
                        const accessToken = generateAccessToken(user.user._id?.toString() as string, user.user.session_version);
                        const refreshToken = generateRefreshToken(user.user._id?.toString() as string, user.user.session_version);

                        res.cookie('mod_accessToken', accessToken, {
                            maxAge: 300000,
                            httpOnly: true,
                            secure: true,
                            sameSite: 'none',
                        });

                        res.cookie('mod_refreshToken', refreshToken, {
                            maxAge: 3.154e10,
                            httpOnly: true,
                            secure: true,
                            sameSite: 'none',
                        });

                        const userSettings = await ensureAccountSettings(user.user._id!.toString());

                        return res.status(200).json({
                            success: true,
                            message: 'Logged in successfully.',
                            accessToken,
                            refreshToken,
                            user: user.user,
                            settings: userSettings,
                        });
                    } catch {
                        return res.status(503).json({ success: false, message: 'Login unavailable. Please try again.' });
                    }
                }
            )(req, res);
        } catch (e) {
            logger.error('An error occurred while logging in: ', e);
            return res.status(400).json({
                success: false,
                message: 'An error occurred while logging in. Please try again.',
            });
        }
    }

    async auth(req: Request, res: Response): Promise<Response | void> {
        const user = req.user;

        const { sid } = req.query;

        if (!user?.userId) {
            return res.status(401).json({ success: false, message: 'User not found.' });
        }

        return withAccountSession(user.userId, async () => {
            const fullUser = await AccountModel.findOne({
                _id: user?.userId,
            }).select('-password');

            if (!fullUser || fullUser.merged_into || (fullUser.session_version ?? 0) !== (user.sessionVersion ?? 0)) {
                return res.status(401).json({ success: false, message: 'User not found.' });
            }

            const userSettings = await ensureAccountSettings(user.userId);
            fullUser.online = userSettings.static_status === 'online';

            if (sid && typeof sid === 'string') {
                const socket = wsHandler.sockets.get(sid);

                if (!socket) {
                    return res.status(200).json({
                        success: false,
                        message: 'Socket not found.',
                    });
                }

                const proof = req.get('x-socket-auth');
                if (
                    typeof proof !== 'string' ||
                    !/^[a-f0-9]{64}$/.test(proof) ||
                    !socket.authNonce ||
                    !timingSafeEqual(Buffer.from(proof), Buffer.from(socket.authNonce))
                ) {
                    return res.status(403).json({ success: false, message: 'Invalid socket authentication.' });
                }
                socket.modUser = fullUser;
                wsHandler.setSocketUser(socket, fullUser._id.toString());
                await AccountModel.updateOne(
                    { _id: fullUser._id },
                    { $set: { online: fullUser.online, ...(fullUser.online ? { lastOnline: null } : {}) } }
                );
            }

            return res.status(200).json({
                success: true,
                user: fullUser,
                settings: userSettings,
            });
        });
    }

    async logout(req: Request, res: Response): Promise<Response | void> {
        const user = req.user;
        if (!user) return res.status(401).json({ success: false, message: 'Unauthorized.' });
        return withAccountSession(user.userId, async () => {
            res.cookie('mod_accessToken', '', {
                maxAge: 0,
                httpOnly: true,
                secure: true,
                sameSite: 'none',
            });

            res.cookie('mod_refreshToken', '', {
                maxAge: 0,
                httpOnly: true,
                secure: true,
                sameSite: 'none',
            });

            try {
                const account = await AccountModel.findById(user.userId).select('session_version');
                if (!account || (account.session_version ?? 0) !== (user.sessionVersion ?? 0))
                    return res.status(401).json({ success: false, message: 'Session expired.' });
                await AccountModel.updateOne(
                    {
                        _id: req.user?.userId,
                    },
                    {
                        $set: { online: false, lastOnline: new Date() },
                        $inc: { session_version: 1 },
                    }
                );

                for (const socket of wsHandler.sockets.values()) {
                    if (socket.modUser?._id?.toString() === req.user?.userId) {
                        wsHandler.clearSocketUser(socket);
                        socket.send({ type: 'account-logged-out', content: null });
                    }
                }
                req.user = undefined;

                return res.status(200).json({
                    success: true,
                    message: 'You have been logged out successfully.',
                });
            } catch (e) {
                logger.error('Error logging out user:', e);
                return res.status(400).send({
                    success: false,
                    message: 'An error occurred while logging out. Please try again later.',
                });
            }
        });
    }
}

export default new AccountController();
