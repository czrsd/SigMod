import AccountModel from '../models/AccountModel';
import UserSettingsModel from '../models/UserSettingsModel';

export class DiscordAccountConflict extends Error {}

export async function ensureAccountSettings(userId: string) {
    try {
        return await UserSettingsModel.findOneAndUpdate(
            { target: userId },
            {
                $setOnInsert: {
                    target: userId,
                    static_status: 'online',
                    accept_requests: true,
                    highlight_friends: true,
                    highlight_color: '#433DA4',
                },
            },
            { upsert: true, new: true }
        );
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        const settings = await UserSettingsModel.findOne({ target: userId });
        if (!settings) throw error;
        return settings;
    }
}

export async function resolveDiscordAccount(profile: { id: string; username: string; avatar: string | null }) {
    if (
        !profile ||
        typeof profile.id !== 'string' ||
        !/^[0-9]{17,20}$/.test(profile.id) ||
        typeof profile.username !== 'string' ||
        !profile.username.length ||
        profile.username.length > 32
    ) {
        throw new Error('Invalid Discord identity.');
    }
    const { id, username, avatar } = profile;
    const imageURL =
        typeof avatar === 'string' && /^[a-zA-Z0-9_]+$/.test(avatar)
            ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
            : 'https://czrsd.com/static/sigmod/SigMod25-rounded.png';
    let account = await AccountModel.findOne({ discord_id: id, merged_into: { $exists: false } });
    if (!account) {
        // V4 stored the verified Discord ID only in its server-generated avatar URL.
        const legacy = await AccountModel.find({
            discord_id: { $exists: false },
            password: { $exists: false },
            merged_into: { $exists: false },
            imageURL: new RegExp(`^https://cdn\\.discordapp\\.com/avatars/${id}/(?:[a-zA-Z0-9_]+)\\.(?:png|gif|webp)(?:\\?.*)?$`),
        }).limit(2);
        if (legacy.length > 1)
            throw new DiscordAccountConflict('Multiple legacy profiles match this Discord account. Account support must resolve them.');
        if (legacy.length === 1) {
            if (legacy[0].role === 'Owner' && process.env.DISCORD_ADMIN_ID !== id) {
                throw new DiscordAccountConflict('The owner account requires verified administrator identity recovery.');
            }
            try {
                account = await AccountModel.findOneAndUpdate(
                    { _id: legacy[0]._id, discord_id: { $exists: false }, merged_into: { $exists: false } },
                    { $set: { discord_id: id } },
                    { new: true }
                );
            } catch (error) {
                if ((error as { code?: number }).code !== 11000) throw error;
            }
            account ??= await AccountModel.findOne({ discord_id: id, merged_into: { $exists: false } });
            if (!account) throw new DiscordAccountConflict('The Discord account changed during login. Please retry.');
        }
    }
    if (!account) {
        const collision = await AccountModel.findOne({ username });
        if (collision && !collision.discord_id && !collision.password && !collision.merged_into) {
            throw new DiscordAccountConflict('An existing legacy profile needs its Discord identity recovered. Contact account support.');
        }
        for (let attempt = 0; !account && attempt < 5; attempt++) {
            const candidate =
                !collision && attempt === 0 ? username : `${username.slice(0, 30)}_${id.slice(-6)}${attempt ? `_${attempt}` : ''}`;
            try {
                account = await AccountModel.create({ username: candidate, discord_id: id, imageURL, role: 'Member' });
            } catch (error) {
                if ((error as { code?: number }).code !== 11000) throw error;
                account = await AccountModel.findOne({ discord_id: id, merged_into: { $exists: false } });
            }
        }
        if (!account) throw new DiscordAccountConflict('Unable to reserve an account name. Please contact account support.');
    }
    const settings = await ensureAccountSettings(account._id.toString());
    // An uploaded avatar and the SigMod username belong to the profile, not the OAuth provider.
    if (account.imageURL.startsWith('https://cdn.discordapp.com/avatars/') || !account.imageURL) account.imageURL = imageURL;
    await account.save();
    return { account, settings };
}
