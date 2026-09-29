import { Request, Response } from 'express';
import { discord_params, modAccount, Role } from '../../types';
import axios from 'axios';
import AccountModel from '../../models/AccountModel';
import { ObjectId } from 'mongodb';
import UserSettingsModel from '../../models/UserSettingsModel';
import {
    generateAccessToken,
    generateRefreshToken,
} from '../../utils/jwtUtils';

class DiscordAuthController {
    async callback(req: Request, res: Response) {
        const { code } = req.query;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'No code provided.',
            });
        }

        const params: discord_params = {
            client_id: process.env.DISCORD_CLIENT_ID || '',
            client_secret: process.env.DISCORD_CLIENT_SECRET || '',
            grant_type: 'authorization_code',
            code: code,
            redirect_uri:
                process.env.NODE_ENV === 'development'
                    ? `http://localhost:3001/api/v5/discord/callback`
                    : `https://mod.czrsd.com/api/v5/discord/callback`,
        };

        const searchParams = new URLSearchParams(params as any);
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept-Encoding': 'application/x-www-form-urlencoded',
        };

        try {
            const response = await axios.post(
                'https://discord.com/api/oauth2/token',
                searchParams,
                { headers }
            );

            const userResponse = await axios.get(
                'https://discordapp.com/api/users/@me',
                {
                    headers: {
                        Authorization: `Bearer ${response.data.access_token}`,
                        ...headers,
                    },
                }
            );

            const { username, avatar, id } = userResponse.data;
            const imageURL = `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`;

            let user: modAccount | null = await AccountModel.findOne({
                username,
            });
            let insertedUserId: ObjectId | null = null;

            if (user) {
                await AccountModel.updateOne(
                    {
                        username,
                    },
                    {
                        $set: {
                            username,
                            imageURL,
                            online: true,
                            lastOnline: null,
                        },
                    }
                );

                user = (await AccountModel.findOne({ username })) as modAccount;
            } else {
                user = new AccountModel({
                    username,
                    imageURL,
                    role: Role.Member,
                    create_time: new Date().toISOString(),
                    online: true,
                    visible: true,
                }) as modAccount;

                const savedUser = await user.save();
                insertedUserId = savedUser.id;

                const defaultSettings = {
                    static_status: 'online',
                    accept_requests: true,
                    highlight_friends: true,
                    highlight_color: '#433DA4',
                    visible: true,
                };

                await UserSettingsModel.create({
                    target: insertedUserId,
                    ...defaultSettings,
                });
            }

            const userId = insertedUserId || user?._id;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID is missing after user creation/update.',
                });
            }

            const userSettings = await UserSettingsModel.findOne({
                target: userId,
            });

            if (userSettings?.static_status === 'online') {
                await AccountModel.updateOne(
                    { _id: new ObjectId(userId) },
                    { $set: { online: true, lastOnline: null } }
                );
            }

            const accessToken = generateAccessToken(userId.toString());
            const refreshToken = generateRefreshToken(userId.toString());

            res.cookie('mod_accessToken', accessToken, {
                maxAge: 300000, // 5 minutes
                httpOnly: true,
                secure: true,
                sameSite: 'none',
            });

            res.cookie('mod_refreshToken', refreshToken, {
                maxAge: 31536000000, // 1 year
                httpOnly: true,
                secure: true,
                sameSite: 'none',
            });

            return res.send(`
                <!DOCTYPE html>
                <html>
                <head><title>Login Complete</title></head>
                <body>
                    <script>
                        if (window.opener) {
                            window.opener.postMessage({
                                type: 'SIGMOD_AUTH_SUCCESS',
                                payload: {
                                    accessToken: '${accessToken}',
                                    refreshToken: '${refreshToken}'
                                }
                            }, '*');
                        }
                        window.close();
                    </script>
                    Login complete. You can close this window.
                </body>
                </html>
            `);
        } catch (e) {
            console.error(e);
            return res.status(500).json({
                success: false,
                message: 'Internal server error.',
            });
        }
    }
}

export default new DiscordAuthController();
