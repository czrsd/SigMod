const fs = require('node:fs');
const path = require('node:path');

function patchLegacyController(source) {
    const start = source.indexOf('            const { username, avatar, id } = userResponse.data;');
    const end = source.indexOf('            const accessToken = generateAccessToken(', start);
    if (start < 0 || end < start || !source.slice(start, end).includes('insertedUserId'))
        throw new Error('Unrecognized legacy Discord callback; refusing to patch.');
    source =
        source.slice(0, start) +
        `            const { account } = await resolveDiscordAccount(userResponse.data);
            const userId = account._id;

` +
        source.slice(end);
    source = source.replace(
        "import { discord_params, modAccount, Role } from '../../types';",
        "import { discord_params } from '../../types';"
    );
    for (const line of [
        "import AccountModel from '../../models/AccountModel';",
        "import { ObjectId } from 'mongodb';",
        "import UserSettingsModel from '../../models/UserSettingsModel';",
    ])
        source = source.replace(line, '');
    source = "import { resolveDiscordAccount } from '../../services/discordAccount';\n" + source;
    source = source.replace('console.error(e);', "console.error('Discord authentication failed.');");
    return source;
}

function prepareLegacy(root, currentSourceRoot = path.resolve(__dirname, '../server/src')) {
    const controller = path.join(root, 'src/controllers/Friends/DiscordAuthController.ts');
    const patched = patchLegacyController(fs.readFileSync(controller, 'utf8'));
    for (const relative of ['models/AccountModel.ts', 'models/UserSettingsModel.ts']) {
        const content = fs.readFileSync(path.join(currentSourceRoot, relative), 'utf8').replace(/mongoose\.model</g, 'mainDB.model<');
        fs.writeFileSync(path.join(root, 'src', relative), "import { mainDB } from '../db/connection';\n" + content);
    }
    const service = path.join(root, 'src/services/discordAccount.ts');
    fs.mkdirSync(path.dirname(service), { recursive: true });
    fs.copyFileSync(path.join(currentSourceRoot, 'services/discordAccount.ts'), service);
    fs.writeFileSync(controller, patched);
}

module.exports = { patchLegacyController, prepareLegacy };
if (require.main === module) {
    if (!process.argv[2]) throw new Error('Provide an isolated legacy candidate directory.');
    prepareLegacy(path.resolve(process.argv[2]));
    console.log('Prepared legacy Discord identity compatibility patch.');
}
