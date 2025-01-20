import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import AccountModel from '../models/AccountModel';
import bcrypt from 'bcryptjs';
import { generateAccessToken, generateRefreshToken } from '../utils/jwtUtils';

passport.use(
    new LocalStrategy(async (username, password, done) => {
        const user = await AccountModel.findOne({ username });
        if (
            !user ||
            (user.password && !(await bcrypt.compare(password, user.password)))
        ) {
            return done(null, false);
        }

        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        return done(null, { user, accessToken, refreshToken });
    })
);
