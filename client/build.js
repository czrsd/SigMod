const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

async function build() {
    console.log('Building SigMod Client...');

    const releaseMeta = fs.readFileSync(path.join(__dirname, 'src', 'meta.js'), 'utf8');

    const devMeta = releaseMeta.replace(/(@name(?::\S+)?\s+SigMod)(\s+-)/g, '$1 DEV$2').replace(/(@version\s+\S+)/g, '$1-dev');

    const files = ['constants_and_utils.js', 'core.js', 'network.js', 'ui.js', 'render.js', 'features.js', 'social.js', 'app.js'];

    let sourceCode = '';
    for (const file of files) {
        sourceCode += fs.readFileSync(path.join(__dirname, 'src', file), 'utf8') + '\n';
    }

    const buildVariant = async (outfile, banner, isDev) => {
        const codeForVariant = sourceCode.replace(/(const SIGMOD_DEV = \{[\s\S]*?enabled:\s*)(true|false)/, `$1${isDev}`);

        const combined = `(() => {\n"use strict";\n${codeForVariant}\n})();\n`;
        const tempJs = path.join(__dirname, 'src', `_temp_${isDev ? 'dev' : 'rel'}.js`);
        fs.writeFileSync(tempJs, combined, 'utf8');

        await esbuild.build({
            entryPoints: [tempJs],
            bundle: false,
            outfile,
            target: 'es2020',
            minify: false,
            banner: { js: banner },
        });

        fs.unlinkSync(tempJs);

        try {
            const prettier = require('prettier');
            const rootPrettierrc = path.resolve(__dirname, '..', '.prettierrc');
            let prettierConfig = {};
            if (fs.existsSync(rootPrettierrc)) {
                prettierConfig = JSON.parse(fs.readFileSync(rootPrettierrc, 'utf8'));
            }
            const builtContent = fs.readFileSync(outfile, 'utf8');
            const formatted = await prettier.format(builtContent, {
                ...prettierConfig,
                filepath: outfile,
            });
            fs.writeFileSync(outfile, formatted, 'utf8');
        } catch (formatErr) {
            console.warn(`[build] Prettier formatting skipped for ${outfile}:`, formatErr.message);
        }

        console.log(`Saved: ${outfile}`);
    };

    await buildVariant(path.join(__dirname, 'script.user.js'), releaseMeta, false);

    const devServerDir = path.resolve(__dirname, '..', 'dev-server');
    if (fs.existsSync(devServerDir)) {
        await buildVariant(path.join(devServerDir, 'SigMod.dev.user.js'), devMeta, true);
        const releaseDir = path.join(devServerDir, 'release');
        if (fs.existsSync(releaseDir)) {
            await buildVariant(path.join(releaseDir, 'SigMod.user.js'), releaseMeta, false);
        }
    }

    console.log('Build complete!');
}

build().catch((err) => {
    console.error(err);
    process.exit(1);
});
