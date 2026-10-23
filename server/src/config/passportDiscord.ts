import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { generateAccessToken, generateRefreshToken } from '../utils/jwtUtils';
import { resolveDiscordAccount } from '../services/discordAccount';

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
                const { account: user } = await resolveDiscordAccount({
                    id: profile.id,
                    username: profile.username,
                    avatar: profile.avatar,
                });

                const accessTokenJWT = generateAccessToken(user._id, user.session_version);
                const refreshTokenJWT = generateRefreshToken(user._id, user.session_version);

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
