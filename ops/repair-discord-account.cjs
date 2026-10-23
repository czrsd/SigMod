const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { MongoClient, ObjectId, BSON } = require('../server/node_modules/mongodb');

async function repairDiscordAccount(db, { discordId, keepId, retireId, apply = false, backupDirectory }) {
    if (!/^[0-9]{17,20}$/.test(discordId) || !ObjectId.isValid(keepId) || !ObjectId.isValid(retireId) || keepId === retireId)
        throw new Error('Invalid repair identities.');
    const keep = new ObjectId(keepId),
        retire = new ObjectId(retireId);
    const accounts = await db
        .collection('modusers')
        .find({ _id: { $in: [keep, retire] } })
        .toArray();
    const original = accounts.find((a) => a._id.equals(keep));
    const duplicate = accounts.find((a) => a._id.equals(retire));
    const avatarMatches = (a) => new RegExp(`^https://cdn\\.discordapp\\.com/avatars/${discordId}/`).test(a.imageURL);
    if (
        !original ||
        !duplicate ||
        original.password ||
        duplicate.password ||
        !avatarMatches(original) ||
        !avatarMatches(duplicate) ||
        (original.discord_id && original.discord_id !== discordId) ||
        (duplicate.discord_id && duplicate.discord_id !== discordId) ||
        original.merged_into ||
        (duplicate.merged_into && duplicate.merged_into !== keepId)
    )
        throw new Error('Account evidence does not match the requested repair.');
    if (original.role === 'Owner' && process.env.DISCORD_ADMIN_ID !== discordId)
        throw new Error('Owner recovery requires the configured Discord administrator identity.');
    const other = await db.collection('modusers').findOne({ discord_id: discordId, _id: { $nin: [keep, retire] } });
    if (other) throw new Error('Another account already owns this Discord identity.');
    const pair = (a, b) => ({ $or: [{ [a]: { $in: [keep, retire] } }, { [b]: { $in: [keep, retire] } }] });
    const filters = {
        friends: pair('user_id', 'friend_id'),
        requests: pair('req_id', 'target_id'),
        messages: pair('sender_id', 'target_id'),
        mod_messages: pair('sender_id', 'target_id'),
        user_settings: { target: { $in: [keepId, retireId] } },
    };
    const snapshot = { accounts };
    for (const [name, filter] of Object.entries(filters)) snapshot[name] = await db.collection(name).find(filter).toArray();
    const summary = {
        keepId,
        retireId,
        discordId,
        username: original.username,
        role: original.role,
        documents: Object.fromEntries(Object.entries(snapshot).map(([key, rows]) => [key, rows.length])),
    };
    if (!apply) return { ...summary, applied: false };
    if (!backupDirectory) throw new Error('A backup directory is required.');
    fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
    const backup = path.join(backupDirectory, `discord-${discordId}-${Date.now()}.json`);
    fs.writeFileSync(backup, BSON.EJSON.stringify(snapshot, { relaxed: false }), { mode: 0o600, flag: 'wx' });
    for (const [collection, left, right] of [
        ['friends', 'user_id', 'friend_id'],
        ['requests', 'req_id', 'target_id'],
    ]) {
        for (const document of snapshot[collection]) {
            if (!document[left].equals(retire) && !document[right].equals(retire)) continue;
            const a = document[left].equals(retire) ? keep : document[left];
            const b = document[right].equals(retire) ? keep : document[right];
            if (a.equals(b)) continue;
            await db
                .collection(collection)
                .updateOne(
                    { [left]: a, [right]: b },
                    { $setOnInsert: { [left]: a, [right]: b, ...(document.timestamp ? { timestamp: document.timestamp } : {}) } },
                    { upsert: true }
                );
        }
        await db.collection(collection).deleteMany({ $or: [{ [left]: retire }, { [right]: retire }] });
    }
    for (const name of ['messages', 'mod_messages']) {
        await db.collection(name).updateMany({ sender_id: retire }, { $set: { sender_id: keep } });
        await db.collection(name).updateMany({ target_id: retire }, { $set: { target_id: keep } });
    }
    if (!snapshot.user_settings.some((s) => s.target === keepId)) {
        const settings = snapshot.user_settings.find((s) => s.target === retireId);
        if (settings) {
            const { _id, ...values } = settings;
            await db
                .collection('user_settings')
                .updateOne({ target: keepId }, { $setOnInsert: { ...values, target: keepId } }, { upsert: true });
        }
    }
    await db.collection('modusers').updateOne(
        { _id: retire },
        {
            $unset: { discord_id: '' },
            $set: { merged_into: keepId, visible: false, online: false, lastOnline: new Date() },
            $inc: { session_version: 1 },
        }
    );
    await db.collection('modusers').updateOne({ _id: keep }, { $set: { discord_id: discordId } });
    return { ...summary, applied: true, backup };
}

module.exports = { repairDiscordAccount };

if (require.main === module) {
    const args = process.argv.slice(2);
    const value = (flag) => args[args.indexOf(flag) + 1];
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sigmod');
    (async () => {
        try {
            await client.connect();
            console.log(
                JSON.stringify(
                    await repairDiscordAccount(client.db(), {
                        discordId: value('--discord-id'),
                        keepId: value('--keep'),
                        retireId: value('--retire'),
                        apply: args.includes('--apply'),
                        backupDirectory: process.env.SIGMOD_IDENTITY_BACKUP_DIR || path.join(os.homedir(), '.local/state/sigmod-identity'),
                    })
                )
            );
        } finally {
            await client.close();
        }
    })().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
