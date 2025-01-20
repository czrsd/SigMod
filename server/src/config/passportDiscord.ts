import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { generateAccessToken, generateRefreshToken } from '../utils/jwtUtils';
import AccountModel from '../models/AccountModel';

passport.use(
    new DiscordStrategy(
        {
            clientID: process.env.DISCORD_CLIENT_ID!,
            clientSecret: process.env.DISCORD_CLIENT_SECRET!,
            callbackURL: process.env.DISCORD_REDIRECT_URL!,
            scope: ['identify'],
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                let user = await AccountModel.findOne({
                    _id: profile.id,
                });

                if (!user) {
                    user = new AccountModel({
                        _id: profile.id,
                        username: profile.username,
                        imageURL: profile.avatar
                            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
                            : '',
                        role: 'Member',
                        badges: [],
                        online: false,
                        visible: true,
                        create_time: new Date(),
                    });
                    await user.save();
                }

                const accessTokenJWT = generateAccessToken(user._id);
                const refreshTokenJWT = generateRefreshToken(user._id);

                return done(null, {
                    user,
                    accessToken: accessTokenJWT,
                    refreshToken: refreshTokenJWT,
                });
            } catch (err) {
                return done(err);
            }
        }
    )
);
