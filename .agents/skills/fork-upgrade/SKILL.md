---
name: fork-upgrade
description: Catch this Rakazo fork up to a new official tagged release and cut over the self-hosted images stack without losing WeCom, Excel, Design CRM, or local branding. Use when the maintainer asks to upgrade Rakazo, follow an official version, rebuild production images, or repeat the v0.8.0-style catch-up.
---

# Fork upgrade (official tag + custom overlay)

This fork is official Rakazo plus WeCom, Excel attachments, and Design CRM visit tools. A major upgrade has two halves: **overlay the tag in git**, then **rebuild and switch the production app image**. Do not skip backup. Do not chase unreleased `upstream/main`.

Talk to the maintainer in Chinese. When they are pasting into SSH, **one command per turn**. A cloud agent cannot SSH to the production host; never ask them to paste private keys or `.env` values. Prefer Cursor Remote SSH on that host for later upgrades so the agent can run the host steps itself.

Read `docs/fork-upgrade.md` for the overlay rules and conflict files. This skill is the runbook the agent follows.

## Boundaries

- Follow only an official **stable tag** (`vX.Y.Z`). Ignore how far `elie222/rakazo` `main` is ahead of that tag.
- Public-repo rules: no hostnames, IPs, emails, account names, or secret values in commits, PRs, or chat.
- List `.env` **keys** only (`cut -d= -f1`). Never `cat` `.env` or backup `env` files.
- Do not `git pull` inside the live `/srv/rakazo` images directory and restart. Overlay happens on GitHub; production consumes a newly built `rakazo/app:<tag>`.
- Keep the WeCom migration directory name `20261022120000_wecom_user_binding`.
- API, worker, web, and supervisor switch together. Leave Postgres on the running volume unless this release's images compose file actually requires 18 **and** a restore drill has already succeeded.
- `docker-compose.images.yml` stays on Postgres 16. Do not run `upgrade-postgres.sh` as part of an images-stack app cutover.
- Builtin Design CRM tools attach only to the bot named exactly `客服助手`. If that bot does not exist, visit lookup goes through a saved Notion credential (`secret_request`) and may ask the owner to allow the call. Do not treat that card as a failed upgrade.

## 1. Git overlay (this repository)

1. `bash scripts/fork-upgrade-status.sh` — record behind-count, custom commits, and the target tag.
2. Skip custom commits that official already absorbed (Excel attachments and thread snapshot cache as of `v0.8.0`).
3. `bash scripts/fork-upgrade-start.sh vX.Y.Z` on a branch `upgrade/vX.Y.Z`. Resolve conflicts by keeping official behavior and re-attaching WeCom / CRM entry points. Custom commit titles stay `custom:`.
4. If GitHub reports the upgrade branch conflicts with current `main` because the chassis changed, on the upgrade branch: `git merge -s ours origin/main` so history is merged and **upgrade-branch files win**. Do not force-push production.
5. Run the tests listed in `docs/fork-upgrade.md`. Open a PR, then `.agents/skills/pr-watch/SKILL.md`. Merge only when the maintainer agrees.

Required `.env` keys after `v0.8.0` (values stay on the server):

- `POSTGRES_APP_PASSWORD` (generate with `openssl rand -hex 16` if missing; Compose will not start without it)
- `WECOM_CORP_ID`, `WECOM_SECRET`, `WECOM_REDIRECT_URI`, optional `WECOM_AGENT_ID`
- `DESIGN_CRM_NOTION_TOKEN`, `DESIGN_CRM_NOTION_DATABASE_ID`, `DESIGN_CRM_ALLOWED_EMAILS` (empty allowlist means nobody can use the visit tools)

## 2. Production layout (images stack)

The live host is an official **published-images** install, not a checkout of this repo at the compose root.

| Path | Role |
| --- | --- |
| `/srv/rakazo` | Compose root: `.env`, `docker-compose.images.yml` |
| `/srv/rakazo/build-*` | Source trees used to `docker build` local `rakazo/app` tags |
| `/srv/rakazo/backups/` | Host backups |
| `~/04-backup-rakazo.sh` | Host backup script from the original install |

`.env` image pins (names only):

- `RAKAZO_IMAGE=rakazo/app`
- `RAKAZO_IMAGE_TAG=<local label>` — currently a date-stamped overlay such as `v080-20261107`
- `RAKAZO_IMAGE_TAG_PREVIOUS=<previous local label>` — keep for rollback
- Computer image stays official (`RAKAZO_COMPUTER_IMAGE` / `RAKAZO_COMPUTER_IMAGE_TAG`)

Brand is **baked into the app image** (icons, `apps/web/public/brand/`, login logo in `Auth.tsx`, titles in `index.html` and `apps/web/src/pwa/plugin.ts`, login strings in locale `msgstr`). `docker-compose.brand.yml` may exist and **not** be mounted; do not assume a volume overlay. Newer official trees may have no `site.webmanifest` file — patch `plugin.ts` instead. Copy brand files from the **currently running** build directory, not from git.

## 3. Host cutover (one command at a time unless Remote SSH)

Work on a weekday-off or quiet evening. Confirm with the maintainer before the compose recreate.

1. `docker compose --env-file .env -f docker-compose.images.yml ps` — all app containers up.
2. `bash ~/04-backup-rakazo.sh` — then copy that stamp directory **off the server** (`scp -r`). Ignore a `chmod` error on an old file in `backups/` if today's stamp contains `postgres.sql`, `env`, `Caddyfile`, `MANIFEST.txt`.
3. In the running build tree: `git fetch origin` and `git log --oneline HEAD..origin/main`. Do not checkout there.
4. `git worktree add /srv/rakazo/build-<label> origin/main` (detached at the merged overlay).
5. Copy brand assets from the live build tree into the new worktree; re-apply the small Auth logo and title patches. Do not copy old `Welcome.tsx` or locale files wholesale onto a tree that moved those files.
6. Confirm `.env` has the keys in section 1. Append missing keys; let the maintainer fill `DESIGN_CRM_ALLOWED_EMAILS` in `nano` and reply only "filled".
7. Build (background, so a dropped SSH session does not kill it):

```bash
cd /srv/rakazo/build-<label> && nohup docker build -f infra/compose/Dockerfile \
  --build-arg GIT_SHA="$(git rev-parse HEAD)" \
  -t rakazo/app:<label> . > /tmp/rakazo-<label>-build.log 2>&1 &
```

Wait until the log shows `naming to docker.io/rakazo/app:<label>` and the job exits 0.

8. Point `.env` at the new tag and remember the old one, then recreate **without pulling**:

```bash
cd /srv/rakazo
# set RAKAZO_IMAGE_TAG and RAKAZO_IMAGE_TAG_PREVIOUS (sed the keys, do not print other lines)
docker compose --env-file .env -f docker-compose.images.yml \
  up -d --wait --pull never api worker web supervisor
```

Expect a short outage. Success: api/web/worker/supervisor healthy or running, `{{.Config.Image}}` is `rakazo/app:<label>`, web `http://127.0.0.1:5173/` returns 200. API `/` may be 404; that is not a failure if the api healthcheck passed.

9. Maintainer logs in (password stays off chat) and sends a normal message. WeCom, Excel, and visit lookup if they use them. `secret_request` + "Checker failed" on a bot that is not `客服助手` is the v0.8.0 credential review path, not a rollback signal, if the visit data still returns after Allow.

## 4. Rollback

If migrations have **not** applied: set `RAKAZO_IMAGE_TAG` back to `RAKAZO_IMAGE_TAG_PREVIOUS` and the same `up -d --wait --pull never` for api worker web supervisor.

If migrations **have** applied: stop the stack, restore the timestamped `postgres.sql` + `.env`, then start the previous image. Do not run a new image against a restored old database or an old image against a migrated database.

## 5. Afterward

- Leave old `rakazo/app:*` tags until the next successful upgrade.
- Do not apply unreleased official `main`.
- Optional later: `harden-host.sh` / kernel updates are a **separate** host-security task, not part of the app tag cutover.
- Offer Cursor Remote SSH (or a worker on the host) so the next upgrade does not need paste-the-command.
