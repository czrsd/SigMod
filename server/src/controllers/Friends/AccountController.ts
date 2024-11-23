import { Request, Response } from 'express';
import {
    validatePassword,
    validatePasswordMatch,
    validateUsername,
} from '../../utils/validation';
import bcrypt from 'bcryptjs';
import { signJWT } from '../../utils/JWT';
import { createSession } from '../../utils/sessions';
import UserSettingsModel from '../../models/UserSettingsModel';
import AccountModel, { IAccount } from '../../models/AccountModel';
import { noXSS } from '../../utils/helpers';
import { RegisterData } from '../../types';

class AccountController {
    async register(req: Request, res: Response): Promise<Response> {
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

            const session = await createSession(insertedUser._id);

            if (!session) {
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

            const accessToken = signJWT(
                { userId: insertedUser._id, sessionId: session.sessionId },
                '5m'
            );

            const refreshToken = signJWT(
                { sessionId: session.sessionId },
                '1y'
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
}

export default new AccountController();
