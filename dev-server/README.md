# SigMod v11 local development

This folder is ready to use directly with VS Code / Devin AI and Violentmonkey.

## Files

- `SigMod.dev.user.js` - development userscript. It loads CSS from localhost.
- `sigmod.css` - the extracted SigMod stylesheet. Edit this directly.
- `start-dev.bat` - starts the local no-cache development server.
- `dev-server.mjs` - dependency-free Node.js development server.
- `release/SigMod.user.js` - release variant that loads CSS from your server.
- `release/sigmod.css` - stylesheet to upload to your server for a release.
- `locales/` - development language packs. English is the built-in fallback.

## First setup

1. Make sure Node.js is installed.
2. Double-click `start-dev.bat`.
3. Keep the terminal window open.
4. Open this URL in Firefox:

   `http://localhost:8787/SigMod.dev.user.js`

5. Install it with Violentmonkey and choose **Track external edits**.
6. Enable Violentmonkey's **Reload tab** option for the tracked script.
7. Disable your normal/release SigMod userscript while the DEV version is enabled, otherwise both will run on Sigmally.

## Development loop

Edit `../sigmod-v11.js` for JavaScript changes, then run `npm run sync:userscripts` from the project root. This regenerates the DEV and release script bodies while preserving each variant's metadata and build mode. Use `npm run check:userscripts` to check for drift; direct edits to generated script bodies will be overwritten by the next sync.

Edit `sigmod.css` directly for development stylesheet changes.

The JS is served from localhost for Violentmonkey to track.

The CSS is loaded by the development userscript from:

`http://localhost:8787/sigmod.css`

The CSS URL gets a timestamp query on every Sigmally page load, so it is never stale. After editing CSS, refreshing Sigmally is enough to see the new style immediately. When editing the userscript, Violentmonkey can reload the matching tab automatically when external-edit tracking is enabled.

There is no npm install and no build command required.

## Important

The DEV userscript intentionally keeps `@grant none`, matching the current SigMod execution model. This matters because SigMod integrates directly with Sigmally and SigFix runtime objects.

## Release

The release userscript uses:

`https://czrsd.com/static/sigmod/v11/sigmod.css`

Before using `release/SigMod.user.js`, upload `release/sigmod.css` to that URL (or change `productionCssUrl` near the top of the userscript).

For releases, the stylesheet URL is versioned with `?v=<SigMod version>` instead of a timestamp, so browsers can cache it normally.

Language packs are served from `/locales/<code>.json` in development. Upload the matching files from `release/locales/` to:

`https://czrsd.com/static/sigmod/v11/locales/`

## If local CSS does not appear

1. Confirm `start-dev.bat` is still running.
2. Open `http://localhost:8787/sigmod.css` directly in Firefox.
3. Reload Sigmally.
4. Check the Firefox console for `Local SigMod CSS could not be loaded`.
