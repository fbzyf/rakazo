---
name: ops-deploy
description: Ship this fork's already-merged main onto the maintainer's production Docker host. Use when asked to 上线, 发版, 部署, 更新生产, deploy the workbench, or roll GitHub main out to the self-hosted server. GitHub merge does not go live by itself.
---

# Deploy this fork to the production VM

Talk to the maintainer in Chinese. Give paste-ready commands. One host command (or one
Mac-to-host heredoc) per turn. Do not ask them to paste a private key, `.env`, or backup
contents.

This is **not** catching up to official Rakazo. That is [docs/fork-upgrade.md](../../../docs/fork-upgrade.md).
Do not `git pull` on the live server as a way to merge upstream.

Public-repo rules: no hostnames, IPs, emails, account names, or secret values in commits,
PRs, or this file. If the maintainer pastes `~/.ssh/config`, use the Host **alias** and
never echo `HostName`, IPs, or `IdentityFile`.

## How a cloud agent reaches the host

Same rule as [provision-accounts](../provision-accounts/SKILL.md): **the agent does not
SSH.** The maintainer runs commands from the Mac that already has an SSH Host alias for
this workbench.

- If they are on that Mac and not yet on the server, wrap the script:
  `ssh <alias> 'bash -s' <<'EOF'` … `EOF`
- If they already have an `ubuntu@…` prompt, give only the inner script.
- If they do not remember the alias, ask which Host in `~/.ssh/config` is the workbench.
  Other Host entries on the same Mac may be unrelated machines.
- Optional agent SSH uses the same `RAKAZO_OPS_SSH_*` secrets as provision-accounts, and
  only after they ask for it. A running agent does not see newly added secrets.

Merging a PR, pushing `main`, or GitHub Actions `deploy-production` (official
`app.rakazo.com`) does **not** update this VM.

## What is actually on the host

Detect every time. Do not assume.

| Path | Role |
|---|---|
| `/srv/rakazo` | Runtime only: `.env`, `docker-compose.images.yml`. **No `.git`.** |
| `/srv/rakazo/build-v080` | Git checkout of **this fork**. Images are built here. |
| `RAKAZO_IMAGE=rakazo/app` | Local name, not GHCR. |
| `RAKAZO_IMAGE_TAG` | `v080-YYYYMMDD` (keep the `v080-` prefix until a later official tag cutover). |
| Postgres | `postgres:16`. Leave it. Do not run `upgrade-postgres.sh` on a routine app ship. |

Typical `docker compose ps` names: `rakazo-api-1`, `rakazo-web-1`, `rakazo-worker-1`,
`rakazo-postgres-1`, `rakazo-supervisor-1`. One-shot `computer` / `data-init` may show
`Exited`; that is normal.

### Detect (read-only)

```bash
set +e
echo "=== host ==="
uname -n -m
df -h / | awk 'NR==2{print}'
echo "=== docker ==="
cd /srv/rakazo && docker compose --env-file .env -f docker-compose.images.yml ps
echo "=== env keys only ==="
grep -E '^(RAKAZO_IMAGE|RAKAZO_IMAGE_TAG|SANDBOX_PROVIDER)=' /srv/rakazo/.env
echo "=== build checkout ==="
git -c safe.directory=/srv/rakazo/build-v080 -C /srv/rakazo/build-v080 remote -v
git -c safe.directory=/srv/rakazo/build-v080 -C /srv/rakazo/build-v080 status -sb
git -c safe.directory=/srv/rakazo/build-v080 -C /srv/rakazo/build-v080 log -1 --oneline
echo "=== local app images ==="
docker images rakazo/app --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}}'
echo "done"
```

Stop if `/srv/rakazo` or `build-v080` is missing, if compose is not the images file, or if
`RAKAZO_IMAGE` is an official GHCR app image they did not mean to replace.

## Brand files in the build tree

`build-v080` carries **uncommitted** brand overrides from earlier cutovers (favicons,
`apps/web/src/pages/Auth.tsx`, `apps/web/src/pwa/plugin.ts`, locale `.po` files).
`git checkout origin/main` keeps them when they do not conflict. **Never**
`git reset --hard`. If checkout stops on a conflict, paste the status back and stop.

## Do not

- `git pull` inside `/srv/rakazo` (it is not a repo).
- `docker compose pull` / omit `--pull never` (would try a registry tag that is not this
  build).
- Recreate or upgrade Postgres on this path.
- Deploy unreleased official `main` / `edge`. Only this fork's `origin/main` SHA they
  asked to ship.
- `set -e` around `~/04-backup-rakazo.sh`: it can `chmod` an old backup file and abort
  before the cutover. Copy `.env` to `.env.bak-YYYYMMDD` yourself; the dated backup
  script is best-effort.

## Ship (two pastes)

Target SHA = `origin/main` after the PRs they want are merged (full 40-char hash).
New tag = `v080-` plus today's UTC date (`YYYYMMDD`). Confirm the current
`RAKAZO_IMAGE_TAG` in detect before writing the `sed` pattern.

### 1. Build (does not replace running containers)

```bash
set -euo pipefail
BUILD=/srv/rakazo/build-v080
TAG=v080-YYYYMMDD
WANT=FULL_SHA_HERE
git -c safe.directory="$BUILD" -C "$BUILD" fetch origin main
git -c safe.directory="$BUILD" -C "$BUILD" checkout origin/main
SHA=$(git -c safe.directory="$BUILD" -C "$BUILD" rev-parse HEAD)
echo "HEAD=$SHA"
test "$SHA" = "$WANT"
cd "$BUILD"
echo "Starting docker build. Log: /tmp/rakazo-${TAG}-build.log"
nohup docker build -f infra/compose/Dockerfile --build-arg GIT_SHA="$SHA" -t "rakazo/app:${TAG}" . \
  >"/tmp/rakazo-${TAG}-build.log" 2>&1 &
echo "PID=$!"
```

Watch with `tail -30 /tmp/rakazo-v080-YYYYMMDD-build.log` (not `-f`, so they can paste).
Success ends with `Successfully tagged rakazo/app:v080-YYYYMMDD` or
`naming to docker.io/rakazo/app:v080-YYYYMMDD done`. Do not cut over before that.

### 2. Cut over api, worker, and web together

Replace `OLD_TAG` with the tag detect printed.

```bash
set -euo pipefail
cd /srv/rakazo
TAG=v080-YYYYMMDD
OLD=v080-OLDDATE
docker image inspect "rakazo/app:${TAG}" >/dev/null
cp -a .env ".env.bak-${TAG}"
sed -i.bak-"${TAG}-sed" "s/^RAKAZO_IMAGE_TAG=${OLD}$/RAKAZO_IMAGE_TAG=${TAG}/" .env
grep '^RAKAZO_IMAGE_TAG=' .env
docker compose --env-file .env -f docker-compose.images.yml up -d --wait --pull never api worker web
docker compose --env-file .env -f docker-compose.images.yml exec -T api \
  node -e "fetch('http://127.0.0.1:3100/internal/health').then(r=>r.text()).then(console.log)"
docker compose --env-file .env -f docker-compose.images.yml ps
```

Require `"ok":true` and `"revision"` equal to the target SHA. Then tell colleagues to
**hard-refresh** the web / WeCom workbench. Desktop installers do not follow this ship.

Leave supervisor on the previous app image unless sandbox/supervisor code changed.

## Rollback

If migrations from this SHA have **not** been applied (cutover failed before a healthy
API), restore the previous tag and recreate:

```bash
cd /srv/rakazo
sed -i 's/^RAKAZO_IMAGE_TAG=v080-YYYYMMDD$/RAKAZO_IMAGE_TAG=v080-OLDDATE/' .env
docker compose --env-file .env -f docker-compose.images.yml up -d --wait --pull never api worker web
```

If migrations **did** run, restoring the old image is not a full rollback. Stop and restore
the dated backup under `/srv/rakazo/backups/` first. See [docs/fork-upgrade.md](../../../docs/fork-upgrade.md).

## Aftercare

- Keep the previous `rakazo/app:v080-*` image on the host until the new one is confirmed.
- Do not delete Docker volumes.
- Routine app ships stay on Postgres 16 until a rehearsed 16→18 upgrade.
