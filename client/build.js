const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

async function build() {
    console.log('Building SigMod Client...');

    const meta = fs.readFileSync(path.join('src', 'meta.js'), 'utf8');

    const files = [
        'constants_and_utils.js',
        'core.js',
        'network.js',
        'ui.js',
        'render.js',
        'features.js',
        'social.js',
        'app.js',
    ];

    let combinedCode = '(() => {\n"use strict";\n';

    for (const file of files) {
        combinedCode += fs.readFileSync(path.join('src', file), 'utf8') + '\n';
    }

    combinedCode += '\n})();\n';

    const tempJs = path.join('src', '_temp_bundle.js');
    fs.writeFileSync(tempJs, combinedCode, 'utf8');

    const result = await esbuild.build({
        entryPoints: [tempJs],
        bundle: false,
        outfile: 'script.user.js',
        target: 'es2020',
        minify: false,
        banner: {
            js: meta,
        },
    });

    fs.unlinkSync(tempJs);

    console.log('Build complete! Output saved to script.user.js');
}

build().catch((err) => {
    console.error(err);
    process.exit(1);
});
