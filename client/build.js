const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

async function build() {
    console.log('Building SigMod Client...');
    
    // Read meta header
    const meta = fs.readFileSync(path.join('src', 'meta.js'), 'utf8');

    // List of files in exact order
    const files = [
        '01_constants_and_utils.ts',
        '02_core.ts',
        '03_network.ts',
        '04_ui.ts',
        '05_render.ts',
        '06_features.ts',
        '07_social.ts',
        '08_app.ts'
    ];

    let combinedCode = '';
    
    // Concatenate all TS chunks
    for (const file of files) {
        combinedCode += fs.readFileSync(path.join('src', file), 'utf8') + '\n';
    }
    
    // Save concatenated TS to a temporary file
    const tempTs = path.join('src', '_temp_bundle.ts');
    fs.writeFileSync(tempTs, combinedCode, 'utf8');

    // Transpile with esbuild
    const result = await esbuild.build({
        entryPoints: [tempTs],
        bundle: false,
        outfile: 'script.user.js',
        target: 'es2020',
        minify: false, // Keep it readable for GreasyFork
        banner: {
            js: meta,
        },
    });
    
    // Clean up temp file
    fs.unlinkSync(tempTs);
    
    console.log('Build complete! Output saved to script.user.js');
}

build().catch((err) => {
    console.error(err);
    process.exit(1);
});
