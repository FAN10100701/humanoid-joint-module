---
name: html-webserial-app
description: 在「人形机器人学习站」仓库里开发或改动网页端串口调试助手子应用（06_学习工具/_串口调试助手/，入口页 06-21）时必须使用本 skill。包含：本目录在站点检查体系中的豁免范围与不豁免范围、必须同步的集成点、纯函数校验脚本的用法、以及指向子应用内规范文档的指针。凡涉及 Web Serial、串口解析、实时波形绘图、HEX 结构表、面板插件描述符、发送引擎、录制回放导出，或需要「做一个网页串口助手 / 把它改成 WebSocket 或 CAN 调试器」，都先读本 skill。技术细节的权威版本在 06_学习工具/_串口调试助手/llms.txt 与 skills/html-webserial-app/SKILL.md。
---

# 串口调试助手子应用 · 仓库集成

## 权威文档在哪（先读这三份，本文件只讲站点集成）

| 内容 | 路径 |
|---|---|
| 模块契约、数据流、命名与代码约定、面板描述符 schema、易踩坑清单 | `06_学习工具/_串口调试助手/llms.txt` |
| 本目录硬规则、与站点同步点、浏览器人工验收清单 | `06_学习工具/_串口调试助手/AGENTS.md` |
| 从零开发同类应用的完整流程（Web Serial 七坑、架构、分帧、插件、发送护栏、验收） | `06_学习工具/_串口调试助手/skills/html-webserial-app/SKILL.md` |

本文件不复述技术细节——**复述必然漂移**。要改代码，先读上面三份。

## 子应用在站点检查体系里的位置（最容易搞错的一点）

- 目录名以 `_` 开头 → `_本地工具/一键自检.ps1` 的可索引页过滤（`-notmatch '\\_'`）会**自动豁免**该目录下
  所有 HTML 的 search-index / sitemap / page-meta / 内联脚本语法检查（先例：`06_学习工具/_作品/`）。
- **豁免不等于免检**，以下仍然会被扫到：
  - 「External JS syntax」：所有 `*.js` 仍被 `node --check` 逐个检查（只排除 `_本地工具/`）——
    所以业务代码必须外置成独立 `.js`，HTML 里零内联业务 JS。
  - 「C4 localStorage key prefixes」：`localStorage` 键必须以 `humanoid-` / `site-` / `robot-` / `__t` 开头。
    本应用固定用 `humanoid-serial-config-v1`。
  - 「C16 precache targets exist」：根 `sw.js` 的 `PRECACHE` 里任何指向本目录的路径必须真实存在。
  - 相对链接审计：本目录 HTML 里的相对链接仍会被逐条 `Test-Path`。
- 本目录 HTML **不进** E2E 的「全站逐页 smoke」（因为不在 search-index 里），但 E2E 内已有
  **三条子应用专项用例**兜底：`serial_shell`（外壳 + 14 模块挂载 + 无 Web Serial 时的降级）/ 
  `serial_pipeline`（演示数据从传输→分帧→解析→绘图的整条链路）/ `serial_export`（配置落盘 + CSV 导出）。
  纯函数与帧管线的回归仍必须靠 `_本地工具/校验串口应用.js`，浏览器人工验收清单在子应用 `AGENTS.md` 末尾。
  （这条「豁免导致检查盲区」已在 `AUDIT.md` A-71 登记为「有意保留 + 补偿脚本」。）

## 改动时的同步清单

| 改动 | 必须同步 |
|---|---|
| 新增 / 改名本目录的 `js/*.js` | `index.html` 底部的 `<script src>` 外链顺序（**依赖顺序即加载顺序，不可打乱**） |
| 新增本目录内的 `.html` 页面 | 无需登记进 search-index；但要在入口页 `06_学习工具/21_串口调试助手.html` 里补链接 |
| 新增本目录的资源文件（图片/字体等） | 加入根 `sw.js` 的 `PRECACHE`（否则自检 C16 不会报警，但离线时会 404） |
| 改入口页文案 / 数字 | `06_学习工具/21_串口调试助手.html`（已登记 search-index / sitemap / page-meta / 学习地图 / index 卡片 / SITE_SECTIONS / 百度清单） |
| 改站点全局数字（页数等） | 与本子应用无关，**不要**因为本目录改动去动 `S.STATS.pages` / og:description |

**版本号约定**：子应用显示自己的 `UI.VERSION`（`js/ui.js`），与站点 `S.VERSION` **不同源**。
理由：本应用是可整目录拷走当基座的独立产物，绑到站点版本号上会让它无法独立演进。
站点发版时**不需要**改 `UI.VERSION`，也不要在 `发版.ps1` 里加它。

## 验证流程（改完必跑）

```bash
# 1) 纯函数 + 帧管线断言（期望输出 SERIAL OK，退出码 0）
node _本地工具/校验串口应用.js

# 2) 站点级自检（JS 语法 / localStorage 键名 / 链接审计 / PRECACHE 存在性等）
powershell -ExecutionPolicy Bypass -File "_本地工具/一键自检.ps1"   # 期望 ALL CHECKS PASSED

# 3) 浏览器层专项（本目录不在全站 smoke 里；需先 pip install playwright + playwright install chromium）
python "_本地工具/e2e/e2e_test.py" --fast                          # 期望 16/16 PASS

# 4) 浏览器人工验收（绘图观感、双主题、七种渲染器这类静态检查抓不到的）
powershell -ExecutionPolicy Bypass -File "_本地工具/启动服务器.ps1"
#    http://127.0.0.1:8123/06_学习工具/_串口调试助手/index.html
```

浏览器人工验收的逐项清单在 `06_学习工具/_串口调试助手/AGENTS.md` 末尾，改完数据管线 / 解析 / 插件层后要逐项过一遍。

## 与本应用相关时容易犯的错

1. **不要给本子应用注册 Service Worker**。根 `sw.js` 的 fetch 默认分支对**所有同源 GET** 做
   stale-while-revalidate，已经覆盖本目录资源；再加一个 SW 会引发「双 SW 缓存战」（站点已因同类问题有过 A-57 事故）。
2. **不要把「file:// 下串口不可用」当 bug 修**。那是浏览器安全模型；正确做法是页面顶部给出具体原因并引导用户走
   `启动服务器.ps1` 或线上地址。
3. **不要为了「统一风格」把本应用改成依赖 `_assets/site.css` / `glass.css`**。它自带 `--sl-*` 令牌与 `sl-` 前缀类名，
   目的是整目录拷走后仍能独立运行。只有入口页 `21_串口调试助手.html` 走站点样式。
4. **不要在渲染器里硬编码颜色**。配色一律从主题令牌取（`--sl-grid/--sl-axis/--sl-ink*`），否则双主题下图表会瞎。
5. **不要引入 `eval` / `new Function`**，也不要把用户填写的公式改成 `Function` 构造。面板包与配置是会被用户互相分享的，
   一旦允许执行代码，导入配置就是 XSS 后门。安全求值实现在 `js/expr.js`。
6. **不要用 `git add -A` 提交**（站点硬规则 1）；本目录文件较多，逐个 `git add` 指定。
7. **不要只往 HTML 里加控件而忘了接线**。每个控件都必须在 `js/ui.js` 里用 `addBind` 落到 `core.config` 上，
   否则界面能点、配置不动（V2.2.0 一次性修过 14 个这样的控件：波特率/编码/换行/自动重连/HEX 发送…）。
   `addBind` 支持 `read/write` 覆盖，用于「复选框 ↔ 字符串」「下拉字面量 `\n` ↔ 真换行」这类类型不一致的场景。
8. **不要让演示模式固定发内置 AA55 帧**。演示数据必须按 `core.config.rule.hex` 合成
   （`transport.buildDemoHexFrameByRule` / `demoRuleUsable`），否则用户配好自定义协议后进演示会一条通道都建不出来。
   写 E2E 想注入配置时，先从子应用页离开再注入 —— `app.js` 在 `beforeunload` 会回写内存配置，注入会被覆盖。
