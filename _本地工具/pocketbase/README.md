# PocketBase 阶段一 · 本地闭环操作手册

> 对应《全站审查报告_2026-09-12.md》§八 阶段一;消毒层(Site.sanitizeHTML)已随本批次上线。
> 本目录所有 `.bat`/`.ps1` 均为 ASCII-only(仓库硬规则 3)。

## 一、一次性准备

1. 下载 PocketBase Windows amd64 版(zip),解压把 `pocketbase.exe` 放进**本目录**:
   - 官方:https://github.com/pocketbase/pocketbase/releases
   - 国内网络可用镜像前缀:`https://ghfast.top/` + 完整 GitHub 下载链接
2. 双击 `启动PocketBase.bat` → 服务跑在 `http://127.0.0.1:8090`(管理台 `/_/`)
3. 双击运行 `初始化集合.ps1`(或右键"使用 PowerShell 运行"),自动完成:
   - superuser 账号:`admin@local.test / pbLocal2026`(可用参数改)
   - `notes` 集合:每条笔记一行,**学生只能读写自己的**(user 关联 + user+itemId 唯一索引)
   - `content` 集合:教师补充讲义,**公开读 / 登录可写**(阶段一单教师口径;多教师角色化在管理台给 users 加 role 字段即可)
   - 演示教师账号:`teacher@local.test / teacher2026`

## 二、日常验证(两分钟)

1. 本地起站点:`python -m http.server 8123`(项目根),浏览器开 `http://127.0.0.1:8123/06_学习工具/01_术语词典.html`
   ⚠ 必须用 **http 本地地址**:cyco.top 是 HTTPS,浏览器会拦截对本地 http 端点的请求(混合内容),这是设计边界不是 bug
2. 任意内容页 → 顶栏 ✏ 打开笔记面板 → footer 出现「☁ 同步」
3. 点 ☁ → 输入教师或学生账号密码(密码只存本次会话)→ toast 报告 拉取/上传/更新 条数
4. **双设备模拟**:另一浏览器(或无痕窗口)登录同一账号再点 ☁ → 两边笔记一致
5. **教师编辑**:登录 teacher 账号 → 内容页出现「📢 教师补充」框 → 点"编辑"写讲义 → 保存;学生(未登录)刷新同页可见讲义

## 三、安全口径(已落地)

- 展示端:教师补充 body 进 innerHTML 前强制过 `Site.sanitizeHTML` 白名单消毒(跨用户内容红线)
- 存储端:notes 集合规则锁死 `user = @request.auth.id`,学生互不可见
- 密码:不落盘,token 仅存 sessionStorage(关标签即失效)
- 题库/AI 答疑的 innerHTML 管道已接入消毒层(一方数据纵深防御)

## 四、边界(如实记录)

- cyco.top 线上站连不到本地 PB(混合内容)——阶段三上 HTTPS 部署后才对线上访客生效
- 教师编辑是"按页讲义"最小闭环(纯文本 + 白名单标记),富文本/插图上传在阶段二(页内编辑模式)
- 同步策略:按条目 ts 最后写入胜(LWW);不做字段级合并
