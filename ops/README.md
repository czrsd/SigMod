# SigMod V5 deployment

Run `npm --prefix server run deploy` after pushing the reviewed release to `origin/main`. The production entry point is `ops/deploy.sh`; the older, untracked production `deploy.sh` is retained but is no longer used by this command.

The script requires the existing deployment user, Node.js compatible with the lockfiles, `flock`, `rsync`, and permission to reload only `sigmod-v5` through PM2. It refuses tracked production changes, fast-forwards to the requested release, installs locked dependencies, builds the dashboard and server, validates JWT signing/verification and admin configuration, and publishes release CSS, locales, and the userscript under `/static/sigmod/v11/`. It checks the local dashboard after reloading V5.

Before the first dashboard deployment, configure `ADMIN_ORIGIN=https://mod.czrsd.com` and the intended `DISCORD_ADMIN_ID` in the existing protected production environment. Register `https://mod.czrsd.com/api/v5/admin/auth/discord/callback` in the existing Discord OAuth application. Preserve existing credentials, profile images, and `server/admin-assets/`.

The `mod.czrsd.com` TLS virtual host needs these locations alongside its existing `/api/v5/` proxy:

```nginx
location /admin {
    proxy_pass http://localhost:3003;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /api/v5/admin/assets/images {
    client_max_body_size 13m;
    proxy_pass http://localhost:3003;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Back up the virtual host and validate with `nginx -t` before reloading Nginx. The upload limit allows multipart overhead above the application's 12 MiB file limit.

Runtime rollback files are saved under the deployment user's `~/.local/state/sigmod-v5/`, with the previous commit ID. A failed pipeline restores saved runtime builds and static assets, then reloads V5. The source checkout remains at the attempted release. If dependency installation changed runtime compatibility, rebuild the recorded previous commit in a separate checkout with its locked dependencies before restoring it. Configuration backups and database backups are separate operational responsibilities; this script does not reverse database writes or delete persistent uploads.

After deployment, check the production commit, PM2 stability, dashboard HTML/assets and nested routes, unauthorized admin responses, public content, WebSocket capabilities, and persistence of monitoring samples. Local tests and these probes do not prove an authenticated Discord login or live gameplay.
