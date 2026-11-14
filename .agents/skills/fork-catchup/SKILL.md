---
name: fork-catchup
description: Compare this fork with official Rakazo and, when a newer stable tag exists, open a review-only upgrade branch. Use for the weekly upstream catch-up, or when asked how far the fork is behind official Rakazo.
---

# 每周跟上官方 Rakazo

对照官方仓库 `https://github.com/elie222/rakazo.git`，用白话写出我们落下多少。只有官方发布了新的稳定标签（`vX.Y.Z`）时，才开一条待审的升级分支。不要合并，不要部署，不要动正在运行的服务器。

人手执行和 Cursor 每周五定时任务执行，都用这份步骤。定时任务的提示词只负责叫你来读本文件。

## 停手

- 不要把官方 `main` 合并进来。`Behind official` 只说明主分支走了多少，不表示这周该升级。
- 不要合并 pull request，不要给 `main` 强推，不要发版，不要改 `CHANGELOG.md`。
- 不要在生产机器上跑，不要跑数据库迁移，不要读或写服务器上的 `.env`。
- 不要执行 `git fetch upstream --tags`。官方有一个叫 `android` 的标签，和本仓库冲突。状态脚本和升级脚本会自己拉取 `v*` 标签。
- 工作区不干净就停，说明哪些文件脏着。不要 stash，不要提交别人的改动。
- 已经有远程分支或未合并的 pull request `upgrade/<最新稳定标签>` 时，不要再跑升级脚本，也不要删掉那条分支。在那条 pull request 上补一句这周的结论即可。

## 1. 看差距

在仓库根目录执行：

```bash
bash scripts/fork-upgrade-status.sh
```

只认下面四行，冒号后面的值去掉首尾空格：

- `Fork base tag:` 我们脚下的稳定标签
- `Latest stable tag:` 官方最新稳定标签
- `Official main past latest stable tag:` 官方主分支比最新稳定标签多多少提交
- `Upgrade due:` `yes` 才升级，`no` 就只写报告

`Behind official` 和后面的提交名单不要贴进报告。

## 2. 写报告

用一条开着的 GitHub issue，标题正好是 `每周官方差距`。没有就新建，有就改写正文，不要每周另开一条。改写正文后再留一句评论：`本周报告已更新。`

正文用白话，不要贴密钥、邮箱、机器名或服务器地址。按这个结构写：

```markdown
## 这周

- 我们脚下的官方版本：<Fork base tag>
- 官方最新稳定版本：<Latest stable tag>
- 结论：<已经在最新稳定版，这周不升级。 / 官方有新的稳定版 <标签>，已另开升级改动。 / 官方有新的稳定版 <标签>，升级停在冲突上。>
- 官方主分支比最新稳定版又多了 <N> 个提交。那些还没发稳定版，不跟。

## 新版本里值得看的变化

<没有新稳定版时写：这周没有新的稳定版。>
<有新稳定版时，读官方 CHANGELOG.md 里这两个标签之间的条目，用白话只写聊天、机器人、电脑、登录、数据库。有 Security 小节时用一句话说明有安全修复。更新日志里没有的功能不要写。>

## 升级

<不开升级时写：不开升级改动。>
<开了则写 pull request 链接，以及企业微信和 CRM 的接入是否还在。冲突则列出文件路径。>
```

数据库有新的迁移文件夹时，在「升级」里写明：换上去之后，数据库改过的部分不能靠换回旧镜像撤销。不要去跑那次迁移。

先把报告写上，再做第 3 步。升级失败也要把已经知道的结论写回这条 issue。

## 3. 有新稳定标签才叠上去

`Upgrade due` 不是 `yes` 就到此结束。

是 `yes` 时，先确认没有远程分支 `upgrade/<最新稳定标签>`，也没有以它为头的未合并 pull request。有就停在第 2 步的补充说明上。

没有才执行状态脚本 `Next:` 那一行，通常是：

```bash
bash scripts/fork-upgrade-start.sh <最新稳定标签>
```

脚本成功时，当前分支是 `upgrade/<标签>`，上面有一次 `custom:` 提交。把它推上去（不要强推），打开指向 `main` 的 pull request。标题用 `升级到官方 <标签>`。正文按仓库要求写 `## What`、`## Why`、`## Changes`、`## Risk`、`## Tested`。`## Risk` 要写数据库迁移不能靠换回旧镜像撤销。然后把链接写回第 2 步的 issue。

在打开 pull request 之前，能跑就跑 `docs/fork-upgrade.md` 里「自有功能的自动化检查」那一组测试。失败也打开 pull request，在 `## Tested` 里写明失败了什么。不要为了这周的报告去跑桌面端的端到端测试，也不要部署。

脚本因冲突退出时，人还在 `upgrade/<标签>` 上。标记里 `<<<<<<< <标签>` 那一侧是官方，`=======` 下面是我们的 fork。官方新逻辑留下，再把我们的接入口接回去。容易撞车的文件和那条不能改名的迁移，以 `docs/fork-upgrade.md` 为准。

只在冲突都解开、并且没有冲突标记残留时，按脚本打印的提交标题提交、推送、开 pull request。解不开的，不要猜，不要提交带冲突标记的文件，不要推送。把冲突文件名单写进 issue，让人在自己的机器上按 `docs/fork-upgrade.md` 重跑。云端这台机器关掉之后，没推送的分支就没了，所以名单必须写在 issue 里。
