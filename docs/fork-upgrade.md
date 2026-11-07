# 丰宝 AI 工作台：官方升级与自有功能区隔

这份说明给维护「丰宝 AI 工作台」用。工作台是官方 [elie222/rakazo](https://github.com/elie222/rakazo) 加上我们自己的功能。升级时要换官方底盘，同时把企业微信、Excel、CRM 这些配件装回去，并且不能弄坏正在用的环境。

一句话：**先在副本上把官方版本和我们的改动叠在一起、测过，再备份生产环境并切换。不要在正在跑的服务器上直接覆盖。**

助手按 `.agents/skills/fork-upgrade/SKILL.md` 执行；本文是规则和命令细节。

## 现在的局面

- 仓库 `main` 已叠在官方 `v0.8.0` 上，自有提交用 `custom:` 标题（企业微信、CRM 拜访、升级说明）。Excel 附件和侧边栏缓存以官方实现为准，不要再拣旧提交。
- 生产是官方 **images** 安装：`/srv/rakazo` 里跑 `docker-compose.images.yml`，应用镜像是本地打的 `rakazo/app:<标签>`，不是在该目录 `git pull` 后重启。源码在 `/srv/rakazo/build-*`。换版时先备份，再在新 worktree 里重建镜像并切换。
- 该 Compose 文件停留在 **Postgres 16**。不要把升 Postgres 18 和应用换版绑在同一次操作里，也不要跑 `upgrade-postgres.sh`。
- 内置拜访工具只挂在名为「客服助手」的机器人上。`DESIGN_CRM_ALLOWED_EMAILS` 为空表示谁都不能用这些工具。
- 品牌图和登录文案打进应用镜像。不要假定品牌 Compose 覆盖已经挂上。
- 以后只跟有标签的稳定版。不要追尚未发版的官方 `main`。
- 企业微信用到的数据表迁移文件夹名叫 `20261022120000_wecom_user_binding`。官方后来也有一个同时间戳、不同名字的迁移。两边可以并存，**已经上过线的迁移文件夹绝不能改名**，否则生产库会以为这是一张新表或漏了一张表。

## 两条线，不要揉成一条

| 线 | 是什么 | 谁改 |
| --- | --- | --- |
| 官方底盘 | 聊天、机器人、电脑、登录框架、数据库结构 | 只从 `elie222/rakazo` 来 |
| 自有配件 | 企业微信登录/工作台网页、Excel 附件、侧边栏缓存、CRM 拜访只读查询 | 只在我们的提交里 |

Git 上对应关系：

- 远程 `origin`：这个 fork（正在维护的工作台）
- 远程 `upstream`：`https://github.com/elie222/rakazo.git`（官方，只读）
- 分支 `main`：当前正在用的「官方某一刻 + 自有功能」
- 分支 `upgrade/<官方标签>`：一次升级的工作副本，测通再合并进 `main`

新的自有提交标题用 `custom:` 开头，例如 `custom: keep WeCom login on the new auth page`。以后要从官方版本上重新叠配件时，靠这个前缀就能认出哪些是我们的。

## 自有文件 vs 容易撞车的文件

升级时，**新文件几乎不会和官方打架**；**改过的官方文件一定会打架**。能写进新文件的，就不要再改官方文件。

### 尽量只动这些（自有文件）

- `packages/auth/src/wecom.ts` 和企业微信测试
- `apps/web/src/lib/wecom-oauth.ts`、`apps/web/src/lib/wecom-webview.ts` 和对应测试、e2e
- `apps/web/public/wecom.js`（CSP 不允许内联脚本，工作台 UA 探测放这个文件）
- `packages/adapters/src/design-crm-tools.ts`、`packages/adapters/src/run-tools-design-crm.ts` 和测试
- `packages/db/prisma/migrations/20261022120000_wecom_user_binding/`
- 本说明和 `scripts/fork-upgrade-*.sh`

官方 `v0.8.0` 已经带了侧边栏会话缓存和 Excel 附件，对应的旧自有提交不要再拣。

### 升级时最容易冲突（官方文件上的补丁）

- `apps/web/src/pages/Auth.tsx`、`apps/web/src/pages/Shell.tsx`、`apps/web/index.html`
- `apps/api/src/app.ts`、`apps/api/src/env.ts`
- `packages/auth/src/index.ts`
- `packages/adapters/src/executor.ts`、`packages/adapters/src/builtin-tools.ts`
- `packages/adapters/src/run-tool-selection.ts`、`packages/adapters/src/run-instructions.ts`、`packages/adapters/src/run-tools.ts`（官方把执行器拆开后，CRM 接入口在这些文件里）
- `packages/core/src/attachments.ts`、`packages/contracts/src/attachments.ts`
- `packages/db/prisma/schema.prisma`
- `.env.example`、各语言 `messages.po`

解决冲突的原则：官方新逻辑留下，再把我们的接入口接回去（企业微信按钮、CRM 工具注册）。不要为了省事把官方整段新代码删掉。

## 升级前必须遵守的规则

1. **不在生产服务器上现场改代码或 `git pull` 完直接重启。** 在开发机或一台空的测试机上做升级分支。
2. **先备份，再迁移。** 数据库迁移通常不能倒回去。镜像可以回上一版，表结构往往不能。
3. **接口、后台任务、网页、supervisor 一起换。** 不要只更新其中一个容器。
4. **不要自己对整个仓库做依赖大升级。** Node、pnpm、各种库跟官方走。
5. **生产不要长期盯着官方 `edge`。** 跟有标签的稳定版（`vX.Y.Z`）。
6. **钥匙只放在服务器 `.env`。** 仓库里的示例必须是假地址、假 ID。

## 每次升级怎么做

Git 叠版本和测试在仓库根目录做。生产切镜像在 `/srv/rakazo` 做：先备份，再新 worktree 打本地 `rakazo/app` 标签。第一次追官方、以后跟新版本，步骤相同；差别只是冲突多少。

### 0. 看差距（不改任何代码）

```bash
bash scripts/fork-upgrade-status.sh
```

它会补上 `upstream` 远程、拉取官方，然后打印：我们相对官方落后多少、自有提交有哪些、官方最新标签是什么。

### 1. 备份正在用的环境

开发 Compose：

```bash
./scripts/backup.sh
```

会写出 `backups/<时间戳>/rakazo.sql` 和 `homes.tgz`。升级失败、数据库还没迁过时，可以用 `./scripts/restore.sh backups/<时间戳>` 回去。

生产 images 栈：在切镜像**当天**跑主机备份脚本，再把当天戳目录拷到机器外。当天目录里应有 `postgres.sql`、`env`、`Caddyfile`、`MANIFEST.txt`。旧备份上的 `chmod` 报错可以忽略。**只要新版本已经对生产库跑过迁移，就不能靠换旧镜像当完整回滚，必须先有这份库备份。**

### 2. 在副本上叠官方版本

把 `v0.8.0` 换成 `fork-upgrade-status.sh` 打印的目标标签：

```bash
bash scripts/fork-upgrade-start.sh v0.8.0
```

脚本会从官方标签新建 `upgrade/v0.8.0`，再按顺序拣入我们的自有提交。

如果停在冲突：

1. 打开列出的文件，官方新代码和我们的接入口都留下。
2. `git add` 那些文件，然后 `git cherry-pick --continue`。
3. 只有打算放弃这一整次升级时，才 `git cherry-pick --abort`。

企业微信那条迁移文件夹保持原名 `20261022120000_wecom_user_binding`，不要为了「看起来更新」而改名。

### 3. 在升级分支上验收

自有功能的自动化检查：

```bash
pnpm test -- \
  packages/auth/src/wecom.test.ts \
  apps/web/src/lib/wecom-oauth.test.ts \
  apps/web/src/lib/wecom-webview.test.ts \
  apps/web/src/pages/Auth.test.tsx \
  packages/core/src/attachments.test.ts \
  packages/contracts/src/attachments.test.ts \
  packages/adapters/src/design-crm-tools.test.ts \
  packages/adapters/src/executor.test.ts \
  apps/api/src/env.test.ts \
  apps/api/src/auth-capabilities.test.ts
```

官方回归（升级后至少做前三项；有 Docker 再做后面两项）：

```bash
pnpm lint
pnpm check
pnpm test
pnpm test:integration
pnpm test:e2e
```

企业微信工作台网页还要：

```bash
pnpm test:e2e -- apps/web/e2e/wecom-webview.spec.ts
```

用人手再走一遍（测试环境，不要在生产上试坏数据）：

- 邮箱密码能登录
- 已绑定的企业微信用户能进工作台
- 未绑定的企业微信用户看到「未绑定」，不会自动建号
- 企业微信里能选 Excel 附件
- 侧边栏切换机器人，对话还在
- 名为「客服助手」的机器人能查拜访（只读）；`DESIGN_CRM_ALLOWED_EMAILS` 以外的账号、以及其他机器人没有这些内置工具
- 发一条普通消息，机器人仍能回

### 4. 测通后再换正在用的环境

第一次追上官方时，GitHub 会显示升级分支和旧 `main` 冲突。这是正常的：底盘已经换成官方标签。合入方式是在升级分支上 `git merge -s ours origin/main`，历史记为已合并、文件以升级分支为准，再快进 `main`。不要在生产服务器上强推，也不要在正在跑的机器上当场解决冲突。

Git 合入之后，生产不要 `git pull` 完重启。生产是 `/srv/rakazo` 的 images 栈，吃的是本地打的 `rakazo/app:<标签>`。

1. 把测通的 `upgrade/<标签>` 合并进 `main` 并推送。
2. 生产 `.env` 补上这次跳版本会用到的键（至少 `POSTGRES_APP_PASSWORD`、`WECOM_CORP_ID`、`WECOM_SECRET`、`WECOM_REDIRECT_URI`、可选 `WECOM_AGENT_ID`、`DESIGN_CRM_NOTION_TOKEN`、`DESIGN_CRM_NOTION_DATABASE_ID`、`DESIGN_CRM_ALLOWED_EMAILS`）。允许名单和库 ID 不再写在代码里，空名单表示谁都不能查拜访。只列键名，不要把 `.env` 内容贴进对话。
3. **Postgres 16 保持不动。** `docker-compose.images.yml` 本身就是 16。不要把 `upgrade-postgres.sh` 和应用换版绑在同一次操作里。
4. 先做上一节的生产备份，再 `git worktree add /srv/rakazo/build-<标签> origin/main` 开新源码树。不要在正在跑的 `build-*` 里 checkout。
5. 从**当前正在跑**的构建目录拷品牌文件（图标、`apps/web/public/brand/`），再补登录页 logo 和标题。不要整份覆盖已经搬家的欢迎页或语言文件。品牌打进镜像。
6. 在新 worktree 里本地构建，让构建在后台跑，避免 SSH 断开把进程带走：

```bash
cd /srv/rakazo/build-<标签> && nohup docker build -f infra/compose/Dockerfile \
  --build-arg GIT_SHA="$(git rev-parse HEAD)" \
  -t rakazo/app:<标签> . > /tmp/rakazo-<标签>-build.log 2>&1 &
```

日志出现 `naming to docker.io/rakazo/app:<标签>` 且进程退出码 0 再往下。

7. 把 `.env` 的 `RAKAZO_IMAGE_TAG` 改成新标签，旧标签写到 `RAKAZO_IMAGE_TAG_PREVIOUS`，然后**不要 pull**：

```bash
cd /srv/rakazo
docker compose --env-file .env -f docker-compose.images.yml \
  up -d --wait --pull never api worker web supervisor
```

接口、后台任务、网页、supervisor 一起换。电脑镜像仍用官方的。会有短暂中断。成功：这四个容器 healthy 或 running，镜像是 `rakazo/app:<标签>`，本机网页端口返回 200。接口根路径 404 只要健康检查过了就算正常。失败时健康检查应保持红灯，此时不要当成功。

8. 再做一次上面的人手清单。别的机器人查拜访会走保存的 Notion 凭据（`secret_request`）；点允许后仍能查到，不是回滚信号。

### 5. 回滚

- 还没对生产库跑新迁移：把 `.env` 的 `RAKAZO_IMAGE_TAG` 改回 `RAKAZO_IMAGE_TAG_PREVIOUS`，同样 `up -d --wait --pull never` 换 api、worker、web、supervisor。
- 已经跑过新迁移：先停服务，用升级前的 `postgres.sql` 和 `.env` 恢复，再启动旧镜像。不要让新镜像对着恢复后的旧库跑，也不要让旧镜像对着迁过的库跑。
- 开发 Compose 可用 `./scripts/restore.sh backups/<时间戳>`。

## 以后怎么继续加自己的功能

- 能用新文件就用新文件，只在官方文件里留一两行接入。
- 提交标题用 `custom:`。
- CRM 这种完全是我们业务的能力，长期更适合做成工作台里配置的 MCP / OpenAPI 连接，而不是写死在内置工具里。那是后续改造，不是第一次升级的前置条件。
- 账号允许名单、Notion 库 ID、企业微信回调地址只放服务器 `.env`，不要写进仓库。

## 这次仓库里多了什么

- `.agents/skills/fork-upgrade/SKILL.md`：下次跟官方稳定版时助手按这个跑。
- `scripts/fork-upgrade-status.sh`：只看差距，不改代码。
- `scripts/fork-upgrade-start.sh`：从官方标签开工作分支并拣入自有提交。
- `.env.example` 里的企业微信回调、CRM 库 ID 和 CRM 允许名单都是空的。真正的值只属于服务器上的 `.env`。
