const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { test } = require('node:test');
const ts = require('../server/node_modules/typescript');

require.extensions['.ts'] = (module, filename) =>
    module._compile(
        ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
                esModuleInterop: true,
                resolveJsonModule: true,
            },
            fileName: filename,
        }).outputText,
        filename
    );

test('friends and Discord production regressions with real MongoDB', { skip: !process.env.SIGMOD_TEST_MONGO_URI }, async (t) => {
    const uri = new URL(process.env.SIGMOD_TEST_MONGO_URI);
    assert.ok(['localhost', '127.0.0.1'].includes(uri.hostname));
    process.env.JWT_PRIVATE_KEY = crypto.randomBytes(32).toString('hex');
    delete process.env.JWT_PUBLIC_KEY;
    const mongoose = require('../server/node_modules/mongoose');
    const database = 'sigmod_friends_test_' + crypto.randomUUID().replaceAll('-', '');
    await mongoose.connect(uri.toString(), { dbName: database, serverSelectionTimeoutMS: 3000 });
    const handler = require('../server/src/socket/SocketController.ts').default;
    require.cache[require.resolve('../server/src/socket/setup.ts')] = { exports: { wsHandler: handler } };
    require('../server/src/config/passportLocal.ts');
    const Account = require('../server/src/models/AccountModel.ts').default;
    const Settings = require('../server/src/models/UserSettingsModel.ts').default;
    const Friend = require('../server/src/models/FriendModel.ts').default;
    const Request = require('../server/src/models/RequestModel.ts').default;
    const Chat = require('../server/src/models/ChatModel.ts').default;
    const { resolveDiscordAccount, ensureAccountSettings } = require('../server/src/services/discordAccount.ts');
    const { sendFriendRequest, handleFriendRequest } = require('../server/src/services/friendships.ts');
    const jwt = require('../server/src/utils/jwtUtils.ts');
    const { handlePrivateMessage, onGoogleAuth } = require('../server/src/socket/core/socketUtils.ts');
    await Promise.all([Account.init(), Settings.init(), Friend.init(), Request.init(), Chat.init()]);
    const express = require('../server/node_modules/express');
    const app = express();
    app.use(express.json());
    app.use(require('../server/node_modules/cookie-parser')());
    app.use('/api/v5', require('../server/src/routes/FriendRoutes.ts').default);
    app.use('/api/v5', require('../server/src/routes/DiscordRoutes.ts').default);
    app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
    const server = app.listen(0, '127.0.0.1');
    if (!server.listening) await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/v5`;
    const profile = { id: '80351110224678912', username: 'czrsd', avatar: 'avatarhash' };
    process.env.DISCORD_ADMIN_ID = profile.id;
    const makeAccount = (username, extra = {}) =>
        Account.create({ username, imageURL: `https://cdn.discordapp.com/avatars/${profile.id}/oldhash.png`, ...extra });
    const call = async (route, account, body, extraHeaders = {}) => {
        const headers = {
            ...(account ? { Authorization: `Bearer ${jwt.generateAccessToken(account._id.toString(), account.session_version)}` } : {}),
            ...extraHeaders,
        };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const response = await fetch(base + route, {
            method: body === undefined ? 'GET' : 'POST',
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            redirect: 'manual',
        });
        return { status: response.status, headers: response.headers, data: await response.json() };
    };
    const socket = (account, sid) => {
        const s = {
            sid,
            req: { headers: { 'user-agent': 'test', 'x-forwarded-for': '127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } },
            modUser: account.toObject(),
            nick: 'game nick',
            server: 'eu',
            tag: 'TAG',
            authNonce: crypto.randomBytes(32).toString('hex'),
            sent: [],
            send(message) {
                this.sent.push(message);
            },
        };
        s.modUser.online = true;
        handler.registerSocket(s);
        handler.setSocketUser(s, account._id.toString());
        return s;
    };
    t.after(async () => {
        await new Promise((resolve) => server.close(resolve));
        assert.equal(mongoose.connection.name, database);
        assert.ok(database.startsWith('sigmod_friends_test_'));
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    });
    t.beforeEach(async () => {
        for (const s of [...handler.sockets.values()]) handler.removeSocket(s);
        await Promise.all([
            Account.deleteMany({}),
            Settings.deleteMany({}),
            Friend.deleteMany({}),
            Request.deleteMany({}),
            Chat.deleteMany({}),
        ]);
    });

    await t.test('legacy Discord login retains account ID, owner role, username, bio, friends and settings', async () => {
        const old = await makeAccount('original_name', { role: 'Owner', bio: 'my bio' });
        await ensureAccountSettings(old._id.toString());
        await Settings.updateOne({ target: old._id.toString() }, { $set: { highlight_color: '#123456' } });
        const { account, settings } = await resolveDiscordAccount(profile);
        assert.equal(account._id.toString(), old._id.toString());
        assert.equal(account.username, 'original_name');
        assert.equal(account.role, 'Owner');
        assert.equal(account.bio, 'my bio');
        assert.equal(settings.highlight_color, '#123456');
        assert.equal(await Account.countDocuments(), 1);
        assert.equal((await resolveDiscordAccount({ ...profile, username: 'renamed' })).account._id.toString(), old._id.toString());
    });
    await t.test('username alone never grants a legacy or privileged account', async () => {
        await makeAccount('czrsd', { role: 'Owner', imageURL: 'https://example.com/picture.png' });
        await assert.rejects(resolveDiscordAccount(profile), /legacy profile/);
        assert.equal(await Account.countDocuments(), 1);
    });
    await t.test('password accounts cannot be claimed through a Discord avatar or username', async () => {
        const old = await makeAccount('czrsd', { password: 'hash', role: 'Owner' });
        const { account } = await resolveDiscordAccount(profile);
        assert.notEqual(account._id.toString(), old._id.toString());
        assert.equal(account.role, 'Member');
        assert.equal((await Account.findById(old._id)).discord_id, undefined);
    });
    await t.test('ambiguous legacy identities fail without creating another profile', async () => {
        await makeAccount('first');
        await makeAccount('second');
        await assert.rejects(resolveDiscordAccount(profile), /Multiple legacy/);
        assert.equal(await Account.countDocuments(), 2);
    });
    await t.test('concurrent initial Discord logins create one account and one settings row', async () => {
        const results = await Promise.all(Array.from({ length: 15 }, () => resolveDiscordAccount(profile)));
        assert.equal(new Set(results.map((r) => r.account._id.toString())).size, 1);
        assert.equal(await Account.countDocuments(), 1);
        assert.equal(await Settings.countDocuments(), 1);
    });
    await t.test('concurrent legacy recovery binds one identity and preserves a custom avatar on subsequent logins', async () => {
        const original = await makeAccount('legacy');
        const results = await Promise.all(Array.from({ length: 8 }, () => resolveDiscordAccount(profile)));
        assert.ok(results.every((r) => r.account._id.toString() === original._id.toString()));
        await Account.updateOne({ _id: original._id }, { $set: { imageURL: 'https://mod.czrsd.com/profiles/custom.webp' } });
        assert.equal((await resolveDiscordAccount(profile)).account.imageURL, 'https://mod.czrsd.com/profiles/custom.webp');
    });
    await t.test('numeric or malformed Discord IDs are rejected', async () => {
        for (const id of [80351110224678912, 'invalid', null])
            await assert.rejects(resolveDiscordAccount({ ...profile, id }), /Invalid Discord/);
        assert.equal(await Account.countDocuments(), 0);
    });
    await t.test('friendship requires a real incoming request and rejects unknown actions and self requests', async () => {
        const a = await makeAccount('alice'),
            b = await makeAccount('bob');
        assert.equal((await call('/me/handle', a, { type: 'accept-request', userId: b._id.toString() })).status, 404);
        assert.equal((await call('/me/handle', a, { type: 'fake-request', userId: b._id.toString() })).status, 400);
        assert.equal((await call('/request', a, { req_id: a._id.toString() })).status, 400);
        assert.equal(await Friend.countDocuments(), 0);
    });
    await t.test('request and acceptance are idempotent under retries and concurrent clicks', async () => {
        const a = await makeAccount('alice'),
            b = await makeAccount('bob');
        await ensureAccountSettings(b._id.toString());
        await Promise.all(Array.from({ length: 8 }, () => sendFriendRequest(a._id.toString(), b._id.toString())));
        assert.equal(await Request.countDocuments(), 1);
        await assert.rejects(handleFriendRequest(a._id.toString(), b._id.toString(), 'accept-request'), /not found/);
        await Promise.all(Array.from({ length: 8 }, () => handleFriendRequest(b._id.toString(), a._id.toString(), 'accept-request')));
        assert.equal(await Friend.countDocuments(), 2);
        assert.equal(await Request.countDocuments(), 0);
        await handleFriendRequest(a._id.toString(), b._id.toString(), 'remove-friend');
        assert.equal(await Friend.countDocuments(), 0);
    });
    await t.test('request opt-out persists and prevents new requests; invalid settings fail', async () => {
        const a = await makeAccount('alice'),
            b = await makeAccount('bob');
        assert.equal((await call('/me/update-settings', b, { type: 'accept_requests', data: false })).status, 200);
        assert.equal((await Settings.findOne({ target: b._id.toString() })).accept_requests, false);
        assert.equal((await call('/request', a, { req_id: b._id.toString() })).status, 400);
        assert.equal((await call('/me/update-settings', b, { type: 'static_status', data: 'bad' })).status, 400);
        assert.equal((await call('/me/update-settings', b, { type: 'highlight_color', data: '#1234567' })).status, 400);
    });
    await t.test('private profiles are absent from discover and search; friend responses exclude Discord identity', async () => {
        const a = await makeAccount('alice'),
            b = await makeAccount('hidden', { visible: false, discord_id: profile.id });
        assert.equal((await call('/search?q=hidden', a)).status, 404);
        assert.equal(
            (await call('/users', a, { amount: 10 })).data.users.some((u) => u.username === 'hidden'),
            false
        );
        await Friend.create({ user_id: a._id, friend_id: b._id });
        const result = await call('/me/friends', a);
        assert.equal(result.data.friends.length, 1);
        assert.equal('discord_id' in result.data.friends[0], false);
    });
    await t.test('socket binding requires a private proof, and offline status survives reauthentication', async () => {
        const a = await makeAccount('alice');
        await ensureAccountSettings(a._id.toString());
        const s = socket(a, 'one');
        handler.clearSocketUser(s);
        assert.equal((await call('/auth?sid=one', a)).status, 403);
        assert.equal((await call('/auth?sid=one', a, undefined, { 'x-socket-auth': s.authNonce })).status, 200);
        assert.equal(handler.onlineFriends([a._id.toString()]).length, 1);
        assert.equal((await call('/me/update-settings', a, { type: 'static_status', data: 'offline' })).status, 200);
        assert.equal((await Settings.findOne({ target: a._id.toString() })).static_status, 'offline');
        assert.equal(handler.onlineFriends([a._id.toString()]).length, 0);
        await call('/auth?sid=one', a, undefined, { 'x-socket-auth': s.authNonce });
        assert.equal(handler.onlineFriends([a._id.toString()]).length, 0);
    });
    await t.test('account switches, multiple tabs and caller-supplied game IDs do not cross private-message recipients', async () => {
        const a = await makeAccount('alice'),
            b = await makeAccount('bob');
        const one = socket(a, 'one'),
            two = socket(a, 'two');
        handler.removeSocket(one);
        assert.equal(handler.onlineFriends([a._id.toString()]).length, 1);
        two.modUser = b.toObject();
        two.modUser.online = true;
        handler.setSocketUser(two, b._id.toString());
        handler.sendToUser(a._id.toString(), { type: 'private-message' });
        assert.equal(two.sent.length, 0);
        await onGoogleAuth({ _id: a._id.toString(), fullName: 'game user', email: 'test@example.test', userAgent: {} }, two);
        assert.ok(await mongoose.connection.db.collection('users').findOne({ _id: a._id }));
        handler.sendToUser(a._id.toString(), { type: 'private-message' });
        assert.equal(two.sent.length, 0);
    });
    await t.test('private messages require friendship and are delivered only after persistence', async () => {
        const a = await makeAccount('alice'),
            b = await makeAccount('bob');
        const sa = socket(a, 'one'),
            sb = socket(b, 'two');
        await assert.rejects(handlePrivateMessage({ target: b._id.toString(), text: 'hello' }, sa), /Only friends/);
        await Friend.create({ user_id: a._id, friend_id: b._id });
        await handlePrivateMessage({ target: b._id.toString(), text: 'hello' }, sa);
        assert.equal(await Chat.countDocuments(), 1);
        assert.equal(sa.sent.length, 1);
        assert.equal(sb.sent.length, 1);
    });
    await t.test('password login returns usable credentials and logout revokes access, refresh and socket identity', async () => {
        const bcrypt = require('../server/node_modules/bcryptjs');
        const a = await makeAccount('alice', { password: await bcrypt.hash('Password123', 4) });
        const login = await call('/login', null, { username: 'alice', password: 'Password123' });
        assert.equal(login.status, 200);
        assert.equal(login.data.user.password, undefined);
        const access = login.data.accessToken,
            refresh = login.data.refreshToken;
        assert.equal((await call('/auth', null, undefined, { Authorization: `Bearer ${access}` })).status, 200);
        const s = socket(a, 'one');
        const simultaneous = await Promise.all([
            ...Array.from({ length: 5 }, () => call('/auth?sid=one', a, undefined, { 'x-socket-auth': s.authNonce })),
            call('/logout', a, {}),
        ]);
        assert.equal(simultaneous.at(-1).status, 200);
        assert.equal(s.modUser, null);
        assert.equal((await call('/auth', null, undefined, { Authorization: `Bearer ${access}` })).status, 401);
        assert.equal((await call('/auth', null, undefined, { 'x-refresh-token': refresh })).status, 401);
    });
    await t.test('expired access tokens refresh, while access and refresh token types cannot be swapped', async () => {
        const a = await makeAccount('alice');
        const expired = require('../server/node_modules/jsonwebtoken').sign(
            { userId: a._id.toString(), valid: true },
            process.env.JWT_PRIVATE_KEY,
            { expiresIn: -1 }
        );
        const refreshed = await call('/auth', null, undefined, {
            Authorization: `Bearer ${expired}`,
            'x-refresh-token': jwt.generateRefreshToken(a._id.toString()),
        });
        assert.equal(refreshed.status, 200);
        assert.ok(refreshed.headers.get('x-new-access-token'));
        await assert.rejects(async () => jwt.verifyAccessToken(jwt.generateRefreshToken(a._id.toString())), /Invalid access/);
        await assert.rejects(async () => jwt.verifyRefreshToken(jwt.generateAccessToken(a._id.toString())), /Invalid refresh/);
    });
    await t.test('temporary database failure during refresh returns unavailable, and cookie logout rejects other origins', async () => {
        const a = await makeAccount('alice');
        const refresh = jwt.generateRefreshToken(a._id.toString());
        const findById = Account.findById;
        try {
            Account.findById = () => {
                throw new Error('test database unavailable');
            };
            assert.equal((await call('/auth', null, undefined, { 'x-refresh-token': refresh })).status, 503);
        } finally {
            Account.findById = findById;
        }
        const cookie = 'mod_accessToken=' + jwt.generateAccessToken(a._id.toString());
        assert.equal((await call('/logout', null, {}, { Cookie: cookie, Origin: 'https://attacker.example' })).status, 403);
        assert.equal((await Account.findById(a._id)).session_version, 0);
    });
    await t.test('OAuth login starts a state-bound flow and rejects callbacks without that state', async () => {
        const response = await fetch(base + '/discord/login', { redirect: 'manual' });
        assert.equal(response.status, 302);
        assert.match(response.headers.get('set-cookie'), /mod_discord_state=/);
        assert.match(new URL(response.headers.get('location')).searchParams.get('state'), /^[a-f0-9]{64}$/);
        assert.equal((await call('/discord/callback?code=forged')).status, 400);
    });
    await t.test('a complete OAuth callback issues credentials for the recovered owner, including after Discord renames', async () => {
        const owner = await makeAccount('original_owner', { role: 'Owner' });
        const axios = require('../server/node_modules/axios').default;
        const previousPost = axios.post,
            previousGet = axios.get;
        try {
            axios.post = async () => ({ data: { access_token: 'mock-provider-token' } });
            axios.get = async () => ({ data: { ...profile, username: 'renamed_on_discord' } });
            const start = await fetch(base + '/discord/login', { redirect: 'manual' });
            const state = new URL(start.headers.get('location')).searchParams.get('state');
            const response = await fetch(base + '/discord/callback?code=mock-code&state=' + state, {
                headers: { Cookie: 'mod_discord_state=' + state },
            });
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('cache-control'), 'no-store');
            const html = await response.text();
            const message = JSON.parse(html.match(/const message = (\{.*\});/)[1]);
            assert.equal(jwt.verifyAccessToken(message.payload.accessToken).userId, owner._id.toString());
            assert.equal(await Account.countDocuments(), 1);
            assert.equal((await Account.findById(owner._id)).role, 'Owner');
        } finally {
            axios.post = previousPost;
            axios.get = previousGet;
        }
    });
    await t.test('profile edits validate every change before writing and cannot change roles', async () => {
        const a = await makeAccount('alice');
        assert.equal(
            (await call('/me/edit', a, { changes: ['username', 'bio'], data: { username: 'new_name', bio: 'x'.repeat(251) } })).status,
            400
        );
        assert.equal((await Account.findById(a._id)).username, 'alice');
        assert.equal((await call('/me/edit', a, { changes: ['role'], data: { role: 'Owner' } })).status, 400);
        assert.equal((await Account.findById(a._id)).role, 'Member');
    });
    await t.test('failed message storage delivers nothing and history is bounded to the participants', async () => {
        const a = await makeAccount('alice'),
            b = await makeAccount('bob'),
            c = await makeAccount('charlie');
        const sa = socket(a, 'one'),
            sb = socket(b, 'two');
        await Friend.create({ user_id: a._id, friend_id: b._id });
        const create = Chat.create;
        try {
            Chat.create = async () => {
                throw new Error('storage unavailable');
            };
            await assert.rejects(handlePrivateMessage({ target: b._id.toString(), text: 'hello' }, sa), /Failed to save/);
            assert.equal(sa.sent.length, 0);
            assert.equal(sb.sent.length, 0);
        } finally {
            Chat.create = create;
        }
        await Chat.insertMany(
            Array.from({ length: 105 }, (_, i) => ({
                sender_id: a._id,
                target_id: b._id,
                content: String(i),
                timestamp: new Date(1000 + i),
            }))
        );
        const result = await call('/me/chat/' + b._id, a);
        assert.equal(result.data.history.length, 100);
        assert.equal(result.data.history[0].content, '5');
        assert.equal((await call('/me/chat/' + b._id, c)).status, 403);
    });
    await t.test('explicit account repair preserves the owner and merges friends, requests and history with a backup', async () => {
        const { repairDiscordAccount } = require('../ops/repair-discord-account.cjs');
        process.env.DISCORD_ADMIN_ID = profile.id;
        const owner = await makeAccount('czrsd', { role: 'Owner', bio: 'preserved' });
        const duplicate = await makeAccount('czrsd_6901', { discord_id: profile.id });
        const friend = await makeAccount('friend');
        await ensureAccountSettings(owner._id.toString());
        await Friend.create([
            { user_id: duplicate._id, friend_id: friend._id },
            { user_id: friend._id, friend_id: duplicate._id },
        ]);
        await Request.create({ req_id: duplicate._id, target_id: friend._id });
        await Chat.create({ sender_id: duplicate._id, target_id: friend._id, content: 'private content' });
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmod-identity-test-'));
        t.after(() => fs.rmSync(directory, { recursive: true }));
        const options = {
            discordId: profile.id,
            keepId: owner._id.toString(),
            retireId: duplicate._id.toString(),
            backupDirectory: directory,
        };
        assert.equal((await repairDiscordAccount(mongoose.connection.db, options)).applied, false);
        const repaired = await repairDiscordAccount(mongoose.connection.db, { ...options, apply: true });
        assert.ok(fs.existsSync(repaired.backup));
        assert.equal((await resolveDiscordAccount(profile)).account._id.toString(), owner._id.toString());
        assert.equal((await Account.findById(owner._id)).role, 'Owner');
        assert.equal(await Friend.countDocuments({ $or: [{ user_id: duplicate._id }, { friend_id: duplicate._id }] }), 0);
        assert.equal(await Friend.countDocuments(), 2);
        assert.equal((await Chat.findOne()).sender_id.toString(), owner._id.toString());
        assert.equal((await call('/auth', duplicate)).status, 401);
        assert.equal((await call('/search?q=czrsd_6901', owner)).status, 404);
        await repairDiscordAccount(mongoose.connection.db, { ...options, apply: true });
        assert.equal(await Friend.countDocuments(), 2);
    });
    await t.test('avatar upload accepts real images, rejects disguised SVG, and removes only the current avatar', async () => {
        const controller = require('../server/src/controllers/Friends/private/ProfileImageController.ts').default;
        const previous = controller.profilesDir;
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmod-avatar-test-'));
        controller.profilesDir = directory;
        t.after(() => {
            controller.profilesDir = previous;
            fs.rmSync(directory, { recursive: true });
        });
        const account = await makeAccount('avatar_user');
        const headers = { Authorization: `Bearer ${jwt.generateAccessToken(account._id.toString())}` };
        const upload = async (buffer, type) => {
            const form = new FormData();
            form.set('image', new Blob([buffer], { type }), 'avatar.png');
            return fetch(base + '/me/upload', { method: 'POST', headers, body: form });
        };
        const png = await require('../server/node_modules/sharp')({ create: { width: 4, height: 4, channels: 4, background: '#123456' } })
            .png()
            .toBuffer();
        const result = await upload(png, 'image/png');
        assert.equal(result.status, 200);
        const user = (await result.json()).user;
        assert.ok(fs.existsSync(path.join(directory, path.basename(user.imageURL))));
        assert.equal(
            (await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>'), 'image/png')).status,
            400
        );
        assert.equal((await fetch(base + '/me/remove', { method: 'DELETE', headers })).status, 200);
        assert.equal(fs.readdirSync(directory).length, 0);
    });
    await t.test('social index migration backs up and removes only duplicate pairs, then enforces uniqueness', async () => {
        const { ensureSocialIndexes } = require('../ops/ensure-social-indexes.cjs');
        const db = mongoose.connection.db;
        await db.collection('friends').dropIndex('user_id_1_friend_id_1');
        const a = new mongoose.Types.ObjectId(),
            b = new mongoose.Types.ObjectId();
        await db.collection('friends').insertMany([
            { user_id: a, friend_id: b },
            { user_id: a, friend_id: b },
            { user_id: b, friend_id: a },
        ]);
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmod-index-test-'));
        t.after(() => fs.rmSync(directory, { recursive: true }));
        const dry = await ensureSocialIndexes(db);
        assert.equal(dry.redundantDocuments, 1);
        assert.equal(await Friend.countDocuments(), 3);
        const result = await ensureSocialIndexes(db, { apply: true, backupDirectory: directory });
        assert.ok(fs.existsSync(result.backup));
        assert.equal(await Friend.countDocuments(), 2);
        await assert.rejects(db.collection('friends').insertOne({ user_id: a, friend_id: b }), (error) => error.code === 11000);
    });
});
