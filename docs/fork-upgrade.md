# 丰宝 AI 工作台：官方升级与自有功能区隔

这份说明给维护「丰宝 AI 工作台」用。工作台是官方 [elie222/rakazo](https://github.com/elie222/rakazo) 加上我们自己的功能。升级时要换官方底盘，同时把企业微信、Excel、CRM 这些配件装回去，并且不能弄坏正在用的环境。

一句话：**先在副本上把官方版本和我们的改动叠在一起、测过，再备份生产环境并切换。不要在正在跑的服务器上直接覆盖。**

## 现在的局面

- 自有功能目前是 8 个提交，叠在当时的官方 `main` 上。
- 官方已经往前走了很多（大约一千多个提交）。最新稳定标签以 `git fetch upstream --tags` 看到的为准，写本文时是 `v0.8.0`。
- **第一次追上官方会比较重**，主要是合并冲突和数据库迁移。追上之后，每次只跟一个官方版本，就会轻很多。
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
3. **接口、后台任务、网页一起换。** 不要只更新其中一个容器。
4. **不要自己对整个仓库做依赖大升级。** Node、pnpm、各种库跟官方走。
5. **生产不要长期盯着官方 `edge`。** 跟有标签的稳定版（`vX.Y.Z`）。
6. **钥匙只放在服务器 `.env`。** 仓库里的示例必须是假地址、假 ID。

## 每周自动对照

随时可以跑下面第 0 步看差距。每周另有一次闹钟，避免人忘了。闹钟不写进 git：在 Cursor 的 Automations 里新建一条定时任务，到点让代理阅读并严格执行 `.agents/skills/fork-catchup/SKILL.md`。

- 名称：每周跟上官方 Rakazo
- 时间：每周五 09:00，时区选香港。编辑器若按 UTC 填，表达式是 `0 1 * * 5`
- 仓库：这个 fork 的 `main`
- 提示词：阅读并严格执行 `.agents/skills/fork-catchup/SKILL.md`。只报告差距；仅当官方有新的稳定标签时开升级改动。不要合并，不要部署。

没有新稳定标签的那一周，只更新标题为「每周官方差距」的那条 GitHub issue。官方 main 上还没打标签的提交只记数量，不拿来升级。已经有未合并的 `upgrade/<标签>` 时不要再开一条。

## 每次升级怎么做

下面两段命令在仓库根目录执行。第一次追官方、以后跟新版本，步骤相同；差别只是冲突多少。

### 0. 看差距（不改任何代码）

```bash
bash scripts/fork-upgrade-status.sh
```

它会补上 `upstream` 远程、拉取官方 `v*` 标签，然后打印：我们相对官方 main 落后多少（这只是参考，不表示该升级）、脚下的稳定标签、最新稳定标签、官方 main 比最新稳定标签多几个提交，以及 `Upgrade due`。`Upgrade due: yes` 才需要往下做。

### 1. 备份正在用的环境

开发 Compose：

```bash
./scripts/backup.sh
```

会写出 `backups/<时间戳>/rakazo.sql` 和 `homes.tgz`。生产环境用 `docs/self-host.md` 里的生产备份方式。升级失败、数据库还没迁过时，可以用 `./scripts/restore.sh backups/<时间戳>` 回去。**只要新版本已经对生产库跑过迁移，就不能靠换旧镜像当完整回滚，必须先有这份库备份。**

### 2. 在副本上叠官方版本

把标签换成 `fork-upgrade-status.sh` 在 `Next:` 一行打印的最新稳定标签：

```bash
bash scripts/fork-upgrade-start.sh <最新稳定标签>
```

脚本会从那个官方标签新建 `upgrade/<标签>`，再把「脚下的稳定标签」到当前分支的整棵树差异叠上去，打成一次 `custom:` 提交。

不要改回「把和官方 main 的共同祖先之后的每个提交再拣一遍」。`v0.8.0` 是用合并提交叠上去的，再拣一次会把已经叠过的企业微信提交又拣一遍。

如果停在冲突：

冲突标记里，`<<<<<<< <新标签>` 那一侧是官方，`=======` 下面是我们现在的 fork。官方新逻辑留下，再把我们的接入口接回去。

1. 打开列出的文件，改完后 `git add` 那些文件。
2. 按脚本打印的标题提交：`custom: overlay <新标签> on fork work from <旧标签>`。
3. 只有打算放弃这一整次升级时，才在升级分支上 `git reset --hard`，回到原来的分支，并删除 `upgrade/<标签>`。

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
- 客服助手能查拜访（只读）；不该用的账号或机器人没有这些工具
- 发一条普通消息，机器人仍能回

### 4. 测通后再换正在用的环境

第一次追上官方时，GitHub 会显示升级分支和旧 `main` 冲突。这是正常的：底盘已经换成官方标签。合入方式是在升级分支上把当前 `main` 记为已合并、但保留升级分支的文件，再快进 `main`。不要在生产服务器上强推，也不要在正在跑的机器上当场解决冲突。

1. 把测通的 `upgrade/<标签>` 合并进 `main` 并推送。
2. 生产 `.env` 补上这次跳版本会用到的项（至少 `POSTGRES_APP_PASSWORD`、企业微信回调、`DESIGN_CRM_NOTION_TOKEN`、`DESIGN_CRM_NOTION_DATABASE_ID`、`DESIGN_CRM_ALLOWED_EMAILS`）。允许名单和库 ID 不再写在代码里，空名单表示谁都不能查拜访。
3. 若现有库还是 Postgres 16，先按 `docs/self-host-upgrading.md` 在**备份恢复环境**演练升到 18，再动生产。
4. 按 `docs/self-host-upgrading.md` 更新镜像。`local` 标签要带当前提交重建；有发布标签则改 `RAKAZO_IMAGE_TAG` 后 pull。接口、后台任务、网页一起换。
5. 接口启动时会跑 `prisma migrate deploy`。失败时健康检查应保持红灯，此时不要当成功。
6. 再做一次上面的人手清单。

### 5. 回滚

- 还没对生产库跑新迁移：把镜像换回上一版，或 `./scripts/restore.sh backups/<时间戳>`。
- 已经跑过新迁移：先停服务，用升级前的库备份恢复，再启动旧镜像。不要指望「只换旧镜像、留新表结构」。

## 以后怎么继续加自己的功能

- 能用新文件就用新文件，只在官方文件里留一两行接入。
- 提交标题用 `custom:`。
- CRM 这种完全是我们业务的能力，长期更适合做成工作台里配置的 MCP / OpenAPI 连接，而不是写死在内置工具里。那是后续改造，不是第一次升级的前置条件。
- 账号允许名单、Notion 库 ID、企业微信回调地址只放服务器 `.env`，不要写进仓库。

## 这次仓库里多了什么

- `scripts/fork-upgrade-status.sh`：只看差距，不改代码。会打印脚下的稳定标签、最新稳定标签，以及官方 main 比最新稳定标签多几个提交。
- `scripts/fork-upgrade-start.sh`：从新的官方稳定标签开工作分支，把脚下标签到当前分支的树差异叠上去。
- `.agents/skills/fork-catchup/SKILL.md`：每周定时任务要执行的步骤。
- `.env.example` 里的企业微信回调、CRM 库 ID 和 CRM 允许名单都是空的。真正的值只属于服务器上的 `.env`。
