#!/usr/bin/env bash
set -Eeuo pipefail

cd /var/www/sigmod_v5
exec 9>"${HOME}/.sigmod-v5-deploy.lock"
flock -n 9 || { echo 'Another SigMod deployment is running.' >&2; exit 1; }
test -z "$(git status --porcelain --untracked-files=no)" || { echo 'Production has tracked changes.' >&2; exit 1; }
git fetch origin main
target="${1:-$(git rev-parse origin/main)}"
test "$(git rev-parse "$target")" = "$(git rev-parse origin/main)" || { echo 'Requested release differs from origin/main.' >&2; exit 1; }
previous="$(git rev-parse HEAD)"
backup="${HOME}/.local/state/sigmod-v5/$(date -u +%Y%m%dT%H%M%SZ)-${previous:0:12}"
static=/var/www/czrsd.com/static/sigmod/v11
mkdir -p "$backup"
printf '%s\n' "$previous" > "$backup/previous-commit"
cp -a server/dist "$backup/server-dist"
if test -d admin/dist; then cp -a admin/dist "$backup/admin-dist"; fi
if test -d "$static"; then cp -a "$static" "$backup/static"; fi

rollback() {
    status=$?
    trap - ERR
    echo "Deployment failed; restoring runtime files from $backup" >&2
    cp -a "$backup/server-dist/." server/dist/
    if test -d "$backup/admin-dist"; then mkdir -p admin/dist; cp -a "$backup/admin-dist/." admin/dist/; fi
    if test -d "$backup/static"; then rsync -rc --delete "$backup/static/" "$static/"; fi
    sudo pm2 reload sigmod-v5 || true
    echo "Source checkout remains at $(git rev-parse HEAD); previous commit: $previous" >&2
    exit "$status"
}
trap rollback ERR

git merge --ff-only "$target"
npm --prefix server ci --silent
npm --prefix admin ci --silent
npm --prefix server run build:all
NODE_ENV=production node - <<'NODE'
process.chdir('server');
const path = require('node:path');
const root = process.cwd();
const dotenv = require(path.join(root, 'node_modules/dotenv'));
const { expand } = require(path.join(root, 'node_modules/dotenv-expand'));
expand(dotenv.config());
expand(dotenv.config({ path: '.env.production' }));
const jwt = require(path.join(root, 'dist/utils/jwtUtils'));
jwt.validateJwtConfiguration();
jwt.verifyAccessToken(jwt.generateAccessToken('release-preflight'));
jwt.verifyRefreshToken(jwt.generateRefreshToken('release-preflight'));
require(path.join(root, 'dist/admin/auth/security')).readAdminConfig();
console.log('Production JWT and admin configuration validated.');
NODE
mkdir -p "$static/locales"
cp dev-server/release/sigmod.css "$static/sigmod.css"
rsync -rc --delete dev-server/release/locales/ "$static/locales/"
cp dev-server/release/SigMod.user.js "$static/SigMod.user.js"
sudo pm2 reload sigmod-v5
for attempt in {1..15}; do
    if curl --fail --silent -H 'Accept: text/html' http://127.0.0.1:3003/admin/ > /dev/null; then
        trap - ERR
        echo "Deployed $(git rev-parse HEAD). Rollback files: $backup"
        exit 0
    fi
    sleep 2
done
echo 'Production readiness check failed.' >&2
false
