# SigMod language packs

The source text in `sigmod-v11.js` is the English fallback. The English pack is intentionally empty because it documents the schema without duplicating every English string.

Add a supported LTR language as `<code>.json` in this directory:

```json
{
  "schemaVersion": 1,
  "locale": "es",
  "messages": {
    "Home": "Inicio",
    "Language": "Idioma",
    "Search SigMod...": "Buscar SigMod..."
  }
}
```

Supported codes are `en`, `es`, `tr`, `fr`, `pt`, `ru`, and `de`. Arabic is intentionally not supported.

Each message key is the original English text or attribute value. Keep placeholders unchanged, for example `Welcome {name}, to the SigMod Client!`. Text is inserted as text only; do not place HTML in message values.

The development server exposes this directory at `http://localhost:8787/locales/`. The currently included language packs are English (built-in fallback), Spanish (`es`), Turkish (`tr`), French (`fr`), Portuguese (`pt`), Russian (`ru`), and German (`de`). Arabic is intentionally not included; all supported layouts remain LTR.

Before a production release, copy each language file to `dev-server/release/locales/` and upload those files to `https://czrsd.com/static/sigmod/v11/locales/`.
