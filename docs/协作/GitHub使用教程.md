# GitHub 使用教程（班级通用,2026-08-28）

> 适用对象:维护者 + 班级同学。建议搭配阅读:
> - `docs/协作/班级协作指南.md` —— 权限模式、master 分支保护、加入步骤、安全红线
> - `docs/协作/给协作者的交接说明.md` —— 站点维护纪律与踩坑记录
>
> 仓库:https://github.com/FAN10100701/humanoid-joint-module (公开,MIT)

---

## 0. 心智模型

```
GitHub 云端仓库(真身)  ← 线上网址就是它发布的
   ↕ clone / push
你电脑上的本地仓库
   ↕ 每个人的云端副本(Fork) 或 在同一个仓库上开分支
每个同学的电脑
```

**核心规则**:`master` 分支 = 线上版本;谁都不许直接改 master,一律走 **Pull Request(PR)** 合并;合并进 master 后 **GitHub Pages 自动发布新内容**。

## 1. 网址怎么来的 / 怎么设置

- GitHub Pages 自动生成网址,规则:`https://<用户名>.github.io/<仓库名>/`
- 本站网址:**https://FAN10100701.github.io/humanoid-joint-module/**
- 内容来源:**master 分支的根目录(root)** → "用哪个分支上线"的答案就是 **master**
- 配置入口:仓库 → **Settings → Pages → Source: Deploy from a branch → Branch: `master` / `/(root)` → Save**
- **更新时机**:改动合并进 master 后约 1–3 分钟自动重新发布,无需手动上传
- **cyco.top**(EdgeOne)是第二套独立托管,**不随 GitHub 自动更新**,需单独上传并核对版本号(曾踩过"cyco.top 落后两个版本"的坑)
- 想用自己域名:Settings → Pages → **Custom domain**,并在域名商加 CNAME 指向 `FAN10100701.github.io`

## 2. 用哪个分支

| 分支 | 用途 |
| --- | --- |
| `master` | 生产分支,线上就是它。**所有人都不直接 push 它**(分支保护强制) |
| `feat/xxx`(自己开) | 干活用,一个任务一个分支,合并后删除 |

- master 已加分支保护:禁止直接 push、必须 PR、PR 必须通过 CI 自检(`self-check`)才能合并。
- 本地现在只有 master 是正常的;每个任务自己开分支即可。

## 3. 每天的基本操作(提交与同步)

```bash
git status                 # 看改了哪些文件
git pull                   # 开工前先拉取最新(合并前尤其重要)
git add 指定文件            # 只提交自己改的文件,严禁 git add -A / git add .
git commit -m "feat: 说明"  # 提交信息格式见下
git push origin 当前分支
```

**提交信息规范**:`feat: 新增xx页面` / `fix: 修复xx链接` / `docs: 更新xx` / `chore: 整理xx`

## 4. 班级同学上传新版本的完整流程

### 流程 A:全班同学(零权限,Fork + PR)

```bash
# 1. 打开仓库 → 右上角 Fork(在自己账号下复制一份)
git clone https://github.com/<你的用户名>/humanoid-joint-module.git
cd humanoid-joint-module

# 2. 开自己的分支
git checkout -b feat/新页面

# 3. 改代码
# 4. 只提交自己改的文件
git add 08_学习工具/新页面.html
git commit -m "feat: 新增xx页"
git push origin feat/新页面

# 5. 去自己的 fork → Pull requests → New pull request
#    base: FAN10100701/humanoid-joint-module 的 master ← compare: 自己的 feat/新页面
# 6. 维护者在原仓库 Pull requests 里 review → 合并
# 7. 合并进 master → Pages 自动更新 → 完成
```

### 流程 B:核心同学(被加为 Collaborator,直接 clone 原仓库)

```bash
git clone https://github.com/FAN10100701/humanoid-joint-module.git
cd humanoid-joint-module
git checkout -b feat/新页面      # 一样开分支,不开 master
# 改 → git add 指定文件 → git commit -m "..." 
git push origin feat/新页面
# 原仓库 → Pull requests → New pull request(feat/新页面 → master)
```

> 分支保护下,即使有 Collaborator 权限,直接 push master 会被 GitHub 拒绝 —— 这是保护在起作用,不是出错。

### PR 描述要求
说明三件事:**改了什么 / 影响哪些页面 / 如何验证**。改共享文件(`_assets/*`、`index.html`、`sw.js`)必须截图验证。

### 同学间不打架的纪律
- 按板块认领(硬件 02/03、软件 06、3D 00、资料 07、题库 08),尽量不碰同一文件。
- 只 `git add 指定文件`;动手前 `git pull`;看到 "file changed since it was read" = 有人在改同一文件,先沟通。
- 新页面落地要**登记五件套**(page-meta / search-index / sitemap / 学习地图 / 首页),漏一处 CI 自检就红。
- **绝不提交** `_视频素材/`、`.trae/`、`.zcode/`、浏览器 profile、临时文件(已在 .gitignore)。

## 5. 如何回退

**① 撤销某次提交(安全,公开仓库首选)**
```bash
git log --oneline          # 找要回退的 commit 哈希
git revert HEAD            # 撤销最近一次(生成反向提交,不动历史)
git revert 9e7e648         # 撤销指定提交
```

**② GitHub 网页回退已合并的 PR**:PR 页面底部 → **Revert** → 自动生成反向 PR → 合并。

**③ 本地强制回退(危险,只在自己电脑用,会丢改动)**
```bash
git reset --hard <commit哈希>   # 本地整个回到某历史点,之后改动全丢
git reset --hard origin/master  # 放弃本地一切,完全对齐云端
```
公共 master **只用 `revert`,绝不用 `reset --hard`**(会改历史导致所有人不同步)。

## 6. 用 GitHub 的哪些功能来"管理"

| 标签页 | 用途 |
| --- | --- |
| Code(首页) | 看文件、提交历史、分支 |
| Issues | 建任务/报 bug/提需求,一个任务一个 Issue,是项目管理载体 |
| Pull requests | 看、审、合并同学提交的改动(核心环节) |
| Actions | CI 自检结果:绿=通过,红=有问题,点进去看报错 |
| Projects | 看板(待办/进行中/完成),多人管理可选 |
| Settings | 分支保护、Pages、Collaborators、Actions 权限(最敏感) |
| Insights | 看谁贡献了多少 |

**维护者日常**:同学提 PR → 看 Actions 是否绿 → review → Merge → 核对线上版本。

## 7. 维护者发版检查清单

- [ ] CI `self-check` 通过(全绿,项数以脚本输出为准)
- [ ] 新页面已走完整登记清单(见根 `AGENTS.md`)
- [ ] 版本号五处同步(site.js / index.html / CHANGELOG.md / sw.js / README.md)
- [ ] 未误提交 `_视频素材/`、`.trae/`、`.zcode/`、个人功能页
- [ ] 腾讯云 Twikoo 孤儿环境已确认停用
- [ ] GitHub Pages 与 cyco.top 版本一致(fetch 页面查版本号,勿假设)

---

## 附:常用命令速查

| 命令 | 作用 |
| --- | --- |
| `git status` | 看改动 |
| `git log --oneline` | 看提交历史 |
| `git pull` | 拉最新 |
| `git checkout -b feat/xx` | 开分支并切换 |
| `git add 指定文件` | 暂存(禁 -A) |
| `git commit -m "..."` | 提交 |
| `git push origin 分支` | 推送 |
| `git revert <哈希>` | 安全撤销(公共分支用这个) |
| `git reset --hard origin/master` | 本地对齐云端(危险) |
