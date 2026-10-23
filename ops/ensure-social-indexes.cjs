const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { MongoClient, BSON } = require('../server/node_modules/mongodb');

async function ensureSocialIndexes(db, { apply = false, backupDirectory } = {}) {
    const definitions = [
        ['friends', { user_id: 1, friend_id: 1 }, 'user_id_1_friend_id_1'],
        ['requests', { req_id: 1, target_id: 1 }, 'req_id_1_target_id_1'],
        ['modusers', { username: 1 }, 'username_1'],
        ['user_settings', { target: 1 }, 'target_1'],
    ];
    const duplicates = [];
    for (const [collection, keys] of definitions) {
        const id = Object.fromEntries(Object.keys(keys).map((k) => [k, '$' + k]));
        const groups = await db
            .collection(collection)
            .aggregate([
                { $sort: { _id: 1 } },
                { $group: { _id: id, ids: { $push: '$_id' }, count: { $sum: 1 } } },
                { $match: { count: { $gt: 1 } } },
            ])
            .toArray();
        if (groups.length && !['friends', 'requests'].includes(collection))
            throw new Error(`${collection} has ambiguous duplicates; manual recovery is required.`);
        for (const group of groups)
            duplicates.push({
                collection,
                keep: group.ids[0],
                remove: group.ids.slice(1),
                documents: await db
                    .collection(collection)
                    .find({ _id: { $in: group.ids } })
                    .toArray(),
            });
    }
    const summary = { duplicatePairs: duplicates.length, redundantDocuments: duplicates.reduce((n, g) => n + g.remove.length, 0) };
    if (!apply) return { ...summary, applied: false };
    if (!backupDirectory) throw new Error('A backup directory is required.');
    fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
    const backup = path.join(backupDirectory, `social-indexes-${Date.now()}.json`);
    fs.writeFileSync(backup, BSON.EJSON.stringify(duplicates, { relaxed: false }), { flag: 'wx', mode: 0o600 });
    for (const group of duplicates) await db.collection(group.collection).deleteMany({ _id: { $in: group.remove } });
    for (const [collection, keys, name] of definitions) {
        const existing = (await db.collection(collection).indexes()).find((i) => i.name === name);
        if (existing && !existing.unique) await db.collection(collection).dropIndex(name);
        await db.collection(collection).createIndex(keys, { name, unique: true });
    }
    return { ...summary, applied: true, backup };
}

module.exports = { ensureSocialIndexes };
if (require.main === module) {
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sigmod');
    (async () => {
        try {
            await client.connect();
            console.log(
                JSON.stringify(
                    await ensureSocialIndexes(client.db(), {
                        apply: process.argv.includes('--apply'),
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
