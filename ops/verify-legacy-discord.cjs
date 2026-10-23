const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

async function verifyLegacy(root) {
    const mongoose = require(path.join(root, 'node_modules/mongoose'));
    const database = 'sigmod_legacy_identity_test_' + crypto.randomUUID().replaceAll('-', '');
    const connection = await mongoose
        .createConnection('mongodb://127.0.0.1:27017/' + database, { serverSelectionTimeoutMS: 3000 })
        .asPromise();
    try {
        require.cache[require.resolve(path.join(root, 'dist/db/connection.js'))] = { exports: { mainDB: connection } };
        require.cache[require.resolve(path.join(root, 'dist/utils/jwtUtils.js'))] = {
            exports: { generateAccessToken: (id) => 'access:' + id, generateRefreshToken: (id) => 'refresh:' + id },
        };
        const Account = require(path.join(root, 'dist/models/AccountModel.js')).default;
        const Settings = require(path.join(root, 'dist/models/UserSettingsModel.js')).default;
        await Promise.all([Account.init(), Settings.init()]);
        process.env.DISCORD_ADMIN_ID = '80351110224678912';
        process.env.DISCORD_REDIRECT_URL = 'https://one.sigmally.com';
        const owner = await Account.create({
            username: 'original_owner',
            imageURL: 'https://cdn.discordapp.com/avatars/80351110224678912/old.png',
            role: 'Owner',
        });
        let profile = { id: '80351110224678912', username: 'renamed_owner', avatar: 'newhash' };
        const axiosPath = require.resolve('axios', { paths: [root] });
        require.cache[axiosPath] = {
            exports: {
                __esModule: true,
                default: {
                    post: async () => ({ data: { access_token: 'mock' } }),
                    get: async () => ({ data: profile }),
                },
            },
        };
        const filename = path.join(root, 'dist/controllers/Friends/DiscordAuthController.js');
        // All provider responses and tokens are fake here; expose errors hidden by the production callback.
        const loaded = new Module(filename, module);
        loaded.filename = filename;
        loaded.paths = Module._nodeModulePaths(path.dirname(filename));
        loaded._compile(
            fs.readFileSync(filename, 'utf8').replace("console.error('Discord authentication failed.');", 'throw e;'),
            filename
        );
        const callback = loaded.exports.default.callback;
        async function login() {
            let destination;
            await callback(
                { query: { code: 'mock' } },
                {
                    redirect(url) {
                        destination = new URL(url);
                        return {};
                    },
                    status(code) {
                        throw new Error('Unexpected HTTP ' + code);
                    },
                }
            );
            return destination.searchParams.get('access_token').slice('access:'.length);
        }
        assert.equal(await login(), owner._id.toString());
        assert.equal(await login(), owner._id.toString());
        assert.equal((await Account.findById(owner._id)).role, 'Owner');
        assert.equal((await Account.findById(owner._id)).username, 'original_owner');
        profile = { id: '80351110224678913', username: 'brand_new', avatar: 'newhash' };
        const results = await Promise.all(Array.from({ length: 12 }, login));
        assert.equal(new Set(results).size, 1);
        assert.equal(await Account.countDocuments(), 2);
        assert.equal(await Settings.countDocuments(), 2);
        return {
            runtime: process.version,
            ownerRecovery: 'PASS',
            renamedDiscordLogin: 'PASS',
            concurrentLogins: 'PASS',
            legacyClientRedirect: 'PASS',
        };
    } finally {
        assert.ok(database.startsWith('sigmod_legacy_identity_test_'));
        assert.equal(connection.name, database);
        await connection.dropDatabase();
        await connection.close();
    }
}

module.exports = { verifyLegacy };
if (require.main === module)
    verifyLegacy(path.resolve(process.argv[2]))
        .then((result) => console.log(JSON.stringify(result)))
        .catch((error) => {
            console.error(error.stack);
            process.exitCode = 1;
        });
