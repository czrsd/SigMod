import { Request, Response } from 'express';
import {
    validatePassword,
    validatePasswordMatch,
    validateUsername,
} from '../../utils/validation';
import bcrypt from 'bcryptjs';
import {
    generateAccessToken,
    generateRefreshToken,
} from '../../utils/jwtUtils';
import UserSettingsModel from '../../models/UserSettingsModel';
import AccountModel, { IAccount } from '../../models/AccountModel';
import { noXSS } from '../../utils/helpers';
import { modAccount, RegisterData } from '../../types';
import { wsHandler } from '../../socket/setup';
import passport from 'passport';
import logger from '../../utils/logger';

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
                } else if (
                    validationResult &&
                    typeof validationResult === 'object' &&
                    'success' in validationResult
                ) {
                    if (!validationResult.success) {
                        errors.push({
                            fieldName,
                            message:
                                validationResult.message || 'Validation failed',
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
                imageURL:
                    'https://czrsd.com/static/sigmod/SigMod25-rounded.png',
                role: 'Member',
                online: true,
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
                            message:
                                'An unknown error has occurred. Please try again.',
                        },
                    ],
                });
            }

            delete insertedUser.password;

            const defaultSettings = new UserSettingsModel({
                target: insertedUser._id,
                static_status: 'online',
                accept_requests: true,
                highlight_friends: true,
                highlight_color: '#433DA4',
            });

            await defaultSettings.save();

            const accessToken = generateAccessToken(insertedUser._id);
            const refreshToken = generateRefreshToken(insertedUser._id);

            res.cookie('mod_accessToken', accessToken, {
                maxAge: 300000, // 5 minutes
                httpOnly: true,
                secure: true,
                sameSite: 'none',
            });

            res.cookie('mod_refreshToken', refreshToken, {
                maxAge: 3.154e10, // 1 year
                httpOnly: true,
                secure: true,
                sameSite: 'none',
            });

            return res.status(201).json({
                success: true,
                message: 'User registered successfully.',
                user: insertedUser,
                settings: defaultSettings.toObject(),
            });
        } catch (err) {
            console.error('Error registering user:', err);
            return res.json({
                success: false,
                message:
                    'An error occurred while registering. Please try again later.',
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
                    if (err || !user) {
                        return res.status(400).json({
                            success: false,
                            message: 'Invalid credentials.',
                        });
                    }

                    const accessToken = generateAccessToken(
                        user.user._id?.toString() as string
                    );
                    const refreshToken = generateRefreshToken(
                        user.user._id?.toString() as string
                    );

                    res.cookie('mod_accessToken', accessToken, {
                        maxAge: 300000, // 5 minutes
                        httpOnly: true,
                        secure: true,
                        sameSite: 'none',
                    });

                    res.cookie('mod_refreshToken', refreshToken, {
                        maxAge: 3.154e10, // 1 year
                        httpOnly: true,
                        secure: true,
                        sameSite: 'none',
                    });

                    const userSettings = await UserSettingsModel.findOne({
                        target: user.user._id?.toString(),
                    });

                    if (!userSettings) {
                        return res.status(400).json({
                            success: false,
                            message: 'User settings not found.',
                        });
                    }

                    if (userSettings.static_status === 'online') {
                        await AccountModel.updateOne(
                            { _id: user.user._id?.toString() },
                            { $set: { online: true, lastOnline: null } }
                        );
                    }

                    return res.status(200).json({
                        success: true,
                        message: 'Logged in successfully.',
                        user: user.user,
                        settings: userSettings,
                    });
                }
            )(req, res);
        } catch (e) {
            logger.error('An error occurred while logging in: ', e);
            return res.status(400).json({
                success: false,
                message:
                    'An error occurred while logging in. Please try again.',
            });
        }
    }

    async auth(req: Request, res: Response): Promise<Response | void> {
        const user = req.user;

        const { sid } = req.query;

        if (!user?.userId) {
            return res
                .status(401)
                .json({ success: false, message: 'User not found.' });
        }

        const fullUser = await AccountModel.findOne({
            _id: user?.userId,
        }).select('-password');

        if (!fullUser) {
            return res
                .status(401)
                .json({ success: false, message: 'User not found.' });
        }

        const userSettings = await UserSettingsModel.findOne({
            target: user?.userId,
        });

        if (!userSettings) {
            return res.status(400).json({
                success: false,
                message: 'User settings not found.',
            });
        }

        if (userSettings.static_status === 'online') {
            await AccountModel.updateOne(
                { _id: user?.userId },
                { $set: { online: true, lastOnline: null } }
            );
        }

        if (sid && typeof sid === 'string') {
            const socket = wsHandler.sockets.get(sid);

            if (!socket) {
                return res.status(200).json({
                    success: false,
                    message: 'Socket not found.',
                });
            }

            socket.modUser = fullUser;
        }

        return res.status(200).json({
            success: true,
            user: fullUser,
            settings: userSettings,
        });
    }

    async logout(req: Request, res: Response): Promise<Response | void> {
        // clear token cookies
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
            // set offline status
            await AccountModel.updateOne(
                {
                    _id: req.user?.userId,
                },
                {
                    $set: { online: false, lastOnline: new Date() },
                }
            );

            // remove user object from req
            req.user = undefined;

            return res.status(200).json({
                success: true,
                message: 'You have been logged out successfully.',
            });
        } catch (e) {
            logger.error('Error logging out user:', e);
            return res.status(400).send({
                success: false,
                message:
                    'An error occurred while logging out. Please try again later.',
            });
        }
    }
}

export default new AccountController();
