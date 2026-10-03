import { Request, Response } from 'express';
import { discord_params, modAccount, Role } from '../../types';
import axios from 'axios';
import AccountModel from '../../models/AccountModel';
import { ObjectId } from 'mongodb';
import UserSettingsModel from '../../models/UserSettingsModel';
import { generateAccessToken, generateRefreshToken } from '../../utils/jwtUtils';
import logger from '../../utils/logger';

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
            const response = await axios.post('https://discord.com/api/oauth2/token', searchParams, { headers });

            const userResponse = await axios.get('https://discordapp.com/api/users/@me', {
                headers: {
                    Authorization: `Bearer ${response.data.access_token}`,
                    ...headers,
                },
            });

            const { username, avatar, id } = userResponse.data;
            const imageURL = avatar
                ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
                : 'https://czrsd.com/static/sigmod/SigMod25-rounded.png';

            // Secure lookup: match exclusively by unique Discord ID to prevent account takeover
            let user = await AccountModel.findOne({ discord_id: id });
            let userId: string | ObjectId;

            if (user) {
                user.imageURL = imageURL;
                user.online = true;
                user.lastOnline = new Date();
                await user.save();
                userId = user._id;
            } else {
                // Ensure unique username
                let targetUsername = username;
                const existingWithName = await AccountModel.findOne({ username: targetUsername });
                if (existingWithName) {
                    targetUsername = `${username}_${String(id).slice(-4)}`;
                }

                const newUser = new AccountModel({
                    username: targetUsername,
                    discord_id: id,
                    imageURL,
                    role: Role.Member,
                    create_time: new Date(),
                    online: true,
                    visible: true,
                });

                const savedUser = await newUser.save();
                userId = savedUser._id;

                const defaultSettings = {
                    target: userId,
                    static_status: 'online',
                    accept_requests: true,
                    highlight_friends: true,
                    highlight_color: '#433DA4',
                    visible: true,
                };

                await UserSettingsModel.create(defaultSettings);
            }

            const userSettings = await UserSettingsModel.findOne({ target: userId });
            if (userSettings?.static_status === 'online') {
                await AccountModel.updateOne({ _id: userId }, { $set: { online: true, lastOnline: null } });
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

            // Target allowed origins for postMessage security
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head><title>Login Complete</title></head>
                <body>
                    <script>
                        if (window.opener) {
                            const message = {
                                type: 'SIGMOD_AUTH_SUCCESS',
                                payload: {
                                    accessToken: '${accessToken}',
                                    refreshToken: '${refreshToken}'
                                }
                            };
                            const allowedOrigins = [
                                'https://sigmally.com',
                                'https://beta.sigmally.com',
                                'https://one.sigmally.com',
                                'http://localhost:5173'
                            ];
                            for (const origin of allowedOrigins) {
                                try {
                                    window.opener.postMessage(message, origin);
                                } catch (_) {}
                            }
                        }
                        window.close();
                    </script>
                    Login complete. You can close this window.
                </body>
                </html>
            `);
        } catch (e) {
            logger.error('Error during Discord OAuth callback:', e);
            return res.status(500).json({
                success: false,
                message: 'Internal server error during authentication.',
            });
        }
    }
}

export default new DiscordAuthController();
