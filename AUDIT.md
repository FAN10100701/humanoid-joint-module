# 隐患台账(AUDIT LEDGER)

> 全站隐患与疏漏的唯一登记处。**每轮迭代循环(见 `docs/维护/迭代循环.md`)从这里选题,结束后回写这里。**
> 首次建账:2026-09-02(V2.1.7 轮,全库排查 25+ 项)。

## 使用约定

- **新增条目**:任何轮次(或日常浏览)发现新隐患,立即在对应严重度区追加,格式照抄现有行。
- **回写时机**:每轮 loop 的 S6 步,把本轮处理的条目改状态、补"根因/防回归"。
- **状态**:`开放` / `修复中` / `已修(Vx.y.z)` / `接受`(有意保留,写明决策人/日期)/ `驳回`(复查后不成立)。
- **严重度**:`P0` 线上功能性/结构性缺陷 · `P1` 明显体验、一致性或数据口径问题 · `P2` 有价值但不紧急 · `P3` 记录在案的低优观察项。
- **防回归**:修完必须落到三处之一——`_本地工具/一键自检.ps1` 新检查项、页面 `?selftest=1` 专项检查、或数值校验脚本 `_本地工具/校验*.js`。落不下的写明原因。

## P0(线上缺陷,下一轮必须清零)

| ID | 状态 | 类别 | 证据 | 摘要 | 根因 / 防回归 |
|----|------|------|------|------|---------------|
| A-01 | 已修(V2.1.7) | 结构 | `index.html:1302` | 文件尾部残留未闭合空 `<script>` 标签(上轮删码遗留,浏览器容错掩盖) | 手工删码无配平检查;**防回归:自检 C1 script 标签配平** |
| A-02 | 已修(V2.1.7) | 依赖 | 原 `_assets/ai-assistant.js:275-285`、`11_保研复试面试题库.html:592-601`、`12_闯关学习.html:588-595`、`site.js:314-331` | KaTeX 加载器**四处各自实现且漂移**:AI 面板与闯关页只剩 npmmirror 单源无回退;四处 CSS 全部单源 | 复制粘贴无单源;**防回归:自检 C2(KaTeX CDN 只许出现在 site.js,且 JS/CSS 各≥4 源)**。现统一走 `site.js` 的 `window.KatexLoader.ensure()`(JS+CSS 四级回退,全挂保持 LaTeX 原文) |
| A-03 | 已修(V2.1.7) | 健壮性 | `11_保研复试面试题库.html:273` | 三个题库数据文件全部加载失败时 `SUB[0].id` 抛 TypeError,页面永远停留"加载中"无提示 | 无空数据兜底;已加错误空态 + 重试入口。selftest 覆盖有限,靠人工断网场景 |
| A-04 | 已修(V2.1.7) | 移动端 | `site.js injectChrome()`、`site.css:264` | `<900px` 隐藏 `.nav-links`(含「板块 ▾」)但内容页不生成汉堡按钮 → **全部内容页移动端无板块导航** | 汉堡样式先于实现存在(site.css 一直有 .nav-ham);已补汉堡 + 复用 `.drawer` 抽屉 |
| A-35 | 已修(V2.1.17) | 3D/路径 | `00_3D解剖/js/app.module.js:132` | **3D 主页引擎本地加载路径错误**:模块内 `import('./lib/three.module.js')` 相对 js/ 目录解析成 `js/lib/`(404),CDN 回退状态机掩盖了它(访客实为每次走 CDN),离线/PWA/CDN 全挂时 3D 主页死;"本地库优先"失效 | ES module 动态 import 相对路径基于模块 URL 而非页面 URL(V2.0.7 起);修:改 `'../lib/'` 一行;**防回归:自检 C6(app.module.js LOC 必须为 '../lib/')**;实测本地模式 THREE_LOADED=true/CDNMODE=false;详见 docs/维护/排查报告-2026-09-05.md |

## P1(体验/一致性,1~3 轮内消化)

| ID | 状态 | 类别 | 证据 | 摘要 | 根因 / 防回归 |
|----|------|------|------|------|---------------|
| A-05 | 已修(V2.1.7) | 数据口径 | `index.html:10` og:description | 写"52 个学习页面",实际 75(首页口径)/76(sitemap) | 手工统计漂移;**防回归:自检 C5(og 数 = statPages 占位 = SECTIONS+1)** |
| A-06 | 已修(V2.1.7) | 数据口径 | `_assets/page-meta.js:74` | 08-11 写"117 题人工编写 / 按 13 学科",V2.1.6 后实为 150 题/17 学科 | 已更正。**注意:首页 #version 与 CHANGELOG 里的历史数字是史实,不改** |
| A-07 | 已修(V2.1.7) | 过时注释 | `_assets/srs.js:3`、`_assets/quiz-bank.js:3-4` | srs 注释"当前 40 题"(实 60);quiz-bank 注释仍要"与 03 页两处同步"(V2.1.4 起已单源) | 已改为单源表述 |
| A-08 | 已修(V2.1.7) | 硬编码 | `12_闯关学习.html:328-329、530` | 徽章文案"通关全部 21 关""全真模拟 ≥14/15"写死;关数/题数其实由 quest-data 驱动 | 已改 `{LVLEN}/{FINM1}/{FINLEN}` 占位动态解析,达标线同步改为 `fin.qs.length-1` |
| A-09 | 已修(V2.1.7) | 硬编码 | index/11_题库/12_闯关/search-index 共 7 处 | "17 学科 150 题"多处写死 | 收敛为 `site.js` 的 `S.STATS` 单源常量;**防回归:自检 C3(SITE_STATS 与 ib-data-a/b/c 实际计数一致)** |
| A-10 | 已修(V2.1.7) | 自检脚本 | `_本地工具/一键自检.ps1` check8 | "Interview bank sync" 漏计 `ib-data-c.js`(V2.1.6 新增),117 vs 150 长期误报 FAIL(CI 形同虚设) | 已修:三文件合计;**教训:加数据文件必须同步自检脚本的文件清单** |
| A-11 | 已修(V2.1.7) | 样式 | `site.css:617-618`、`glass.css` 6 处 hover transform | 触屏点击后残留放大/抬起态(sticky-hover) | site.css 包 `@media(hover:hover)`;glass.css 追加 `@media(hover:none)` 覆盖块 |
| A-12 | 已修(V2.1.7) | 性能 | `index.html` 星尘 canvas | rAF 常驻:标签页隐藏/滚出视口仍持续绘制 150 粒 | 已加 `visibilitychange` + IntersectionObserver 暂停恢复 |
| A-13 | 已修(V2.1.7) | 兼容 | 原 `site.js:268-269` | 术语提示读 `window.event`(Firefox 无此全局,提示退化到左上角) | 已改 mouseup 事件对象捕获坐标 |
| A-14 | 已修(V2.1.7) | 安全 | `11_保研复试面试题库.html:397` | `it.links[j].u` 未转义直接拼 href(一方数据,纵深防御仍该做) | 已加 `safeLink()`:协议白名单(http/https/相对)+ 引号转义 |
| A-15 | 已修(V2.1.7) | 健壮性 | `site.js` 不蒜子注入 | 第三方统计脚本加载失败后节点残留 | 已加 `onerror` 移除,页脚保持 `--` |
| A-16 | 已修(V2.1.7) | 规范 | `12_闯关学习.html:220-229` | `logActivity()` 整函数复制,`humanoid-site-activity-v1` 字面量两处 | 已收敛:`site.js` 暴露 `S.logActivity`,闯关页删副本 |
| A-33 | 已修(V2.1.7) | 工具脚本 | `_本地工具/发版.ps1` | `$enc.ReadFile/WriteFile` 不是 UTF8Encoding 的方法,**发版脚本从未跑通过**(版本一直手工同步) | 已改 `[IO.File]::ReadAllText/WriteAllText`,V2.1.7 发版实测走通;教训:新脚本必须实跑一次再入库 |
| A-34 | 已修(V2.1.8) | 缓存 | `sw.js` SWR 后台更新 | SWR 的后台 revalidate `fetch(e.request)` 走 HTTP 缓存(max-age 3600),**不在 PRECACHE 清单的 `_assets` 文件(site-selftest.js / ai-fab-chat.js / glass.css 等)部署后 1 小时内访客拿不到新版**,且自检/C2 类检查无法发现 | 后台更新改 `fetch(req, { cache:"reload" })` 强制回源(资源与页面两分支);教训:SW 策略改动必须用双次刷新实测缓存链路 |
| A-36 | 已修(V2.1.17) | 3D/一致性 | `app.module.js:1989`(resetAllJoints)、`:224`(animTime) | 整机复位不清步态相位源 animTime:复位后再开步态,腿部从半空相位起步,与「复位=回到初始状态」预期不符 | animTime 仅在 L1865 累加、全文件无清零路径;修:resetAllJoints 内补 animTime=0;实测复位后再开步态从直立起步;防回归:逐页测试清单 3D 项补「复位后开步态从直立起步」 |
| A-42 | 已修(V2.1.17) | 3D/致命 | `app.module.js:338`(resetView 拆解分支) | **拆解场景「复位视角」自 V2.0.7 起从未生效**:①`tdExplodeDir` 从未声明(正确名为 L2067 `tdAutoDir`),ES module 严格模式赋值抛 ReferenceError,resetView 在重置爆炸度前中断,后面 exrng/applyTdExplode/fitCamera 从未执行;②且未清 tdAutoOn/tdExplodeTarget/tdSeqOn 状态机,主循环会把爆炸度推回 | 修:变量名对齐 tdAutoDir + resetView 拆解分支开头清状态机与三按钮 on 态;实测爆炸 100→复位→exrng=0/按钮态清/回装配态;**教训:模块内新变量必须集中声明,静态语法检查查不出未声明赋值**;发现于 A-35 修复的浏览器实测中 |

## P2(有价值,排队消化)

| ID | 状态 | 类别 | 证据 | 摘要 | 备注 |
|----|------|------|------|------|------|
| A-17 | **接受**(用户决定 2026-09-02) | 隐私 | `site.js` CONTACT_EMAIL、index 版本历史 | 站长邮箱明文可被爬虫抓取 | V2.1.5 刚为修"邮箱不显示"竞态改内联单源,再混淆有回归风险;维持明文 |
| A-18 | 开放 | 性能/仓库 | `00_3D解剖/models/` 约 108MB | 同一零件 STL + STL.gz + drc 三格式全进 git(x1 原始 STL 就 62MB) | 运行时已有 drc→gz→STL 三级降载;可删工作区原始 STL,是否清 git 历史需权衡(clone 体积 vs 改写历史) |
| A-19 | 开放 | 架构 | `00_3D解剖/js/app.module.js` 3066 行 | 3D 引擎/UI/校验混居单文件,全站最大维护风险点 | 拆分需专门一轮 + 完整回归 4 个 3D 页 |
| A-20 | 开放 | 性能 | `03_项目实操/11_电源管理功率链路分析/_shared/js/mermaid.min.js` 2.5MB | 仅为一页 2 张流程图引入全量 mermaid | 可改动态 import 或换预渲染 SVG |
| A-21 | 开放 | 安全 | KaTeX 四源、不蒜子、three.js CDN | 所有 CDN `<script>` 无 SRI(integrity) | 多源回退与 SRI 天然冲突,需按源固定版本+各自哈希 |
| A-22 | 已修(V2.1.18) | 架构 | `esc()`×3(`site.js`/11_题库/12_闯关)、`loadScript()`×2 | 小工具函数重复 | 已收敛:site.js 暴露 `Site.esc`/`Site.loadScript` 单源(ensureSearchIndex 同步改走),题库/闯关页改 `var esc=Site.esc` 引用;实测两页渲染正常零报错,搜索索引经新路径加载成功;**防回归:自检 C8(两页禁再出现 function esc(/function loadScript( 定义)** |
| A-23 | 开放 | 可维护 | `site.js` 导航样式单行约 2KB、`ib-data-b.js` 单题行超 1KB | 巨型单行导致 diff/评审/合并极不友好 | 格式化会污染 blame,建议趁大改时顺手做 |
| A-24 | 开放 | 规范 | localStorage 16+ 键 | 无版本迁移机制(仅 `-v1/-v2` 换键弃数据);`humanoid-interview-v1` 脏数据只增不删 | 前缀白名单已有 C4 把关;迁移函数待需求出现再做 |
| A-25 | 开放 | 自检 | 体检页/自检挂件 | 生产环境对访客常驻运行自检挂件(性能/噪音),无环境开关 | 可加 `?selftest=0` 或 hostname 判断;挂件是站点特色,改动需用户拍板 |
| A-26 | 开放 | 自检 | 体检页 `15_全站体检.html`、自检挂件 | 检查逻辑硬编码在页面内联脚本,与 ps1 三处各一套口径 | 长期:抽公共检查清单配置(纯静态站的"配置即检查") |
| A-27 | 开放 | 数据 | `11_保研复试面试题库.html:474-538` | 页内选择题 `QUIZ/QUIZ_ADV` 内联,与 ib-data 并存于同一功能 | 迁入独立数据文件,题库页彻底"零题目" |
| A-39 | 已修(V2.1.17) | 3D/诊断 | `电机编码器与灵巧手3D拆解.html:678-681` | 装配探针对程序化几何(编码器 6 件)显示 1e9 空包围盒——探针只在 `g.boundingBox` 存在时累计,Box/CylinderGeometry 从未 computeBoundingBox | 诊断显示失真,非渲染缺陷;修:探针累计前补 computeBoundingBox;实测编码器包围盒输出真实几何边界 |
| A-40 | 已修(V2.1.18) | 自检 | `_本地工具/校验RL实验室.js` | Q-learning 训练未固定随机种子,断言④(±0.2 起摆)统计非确定,实测 4 跑 1 FAIL(0/5)后连跑 3 次全过——CI 语境偶发误报会造成"狼来了" | 已加可种子 LCG(种子 20260905)替换全部 5 处 Math.random,固定种子下连跑两次 MATH OK(可复现,此后 FAIL 即真回归);断言维持 5/5 |
| A-41 | 已修(V2.1.17) | 3D/体验 | `电机编码器与灵巧手3D拆解.html:1061-1065`(toggleExplode)、`:710`(camGoal 到达判定) | 一键拆解/复位时相机 dist 按目标爆炸度一次取景,与 explode 阻尼插值不同步——复位瞬间零件还在装回、相机已拉近,顶盖出画观感突兀 | 修:主循环取景跟随(camGoal 存在且爆炸度未收敛时每帧按 LAB.explode 重算 camGoal.dist)+到达判定追加爆炸度收敛条件(否则 camGoal 半路提前置 null,dist 卡中途——首版修复实测卡 10.42/14.74 即此因);实测正向 dist→18.00/复位→10.08 双向到位 |

## P3(记录在案)

| ID | 状态 | 类别 | 证据 | 摘要 | 备注 |
|----|------|------|------|------|------|
| A-28 | 开放 | 兼容 | `sw.js:58` 跨域不缓存 | KaTeX 的 JS/CSS 永远进不了 SW → 离线时公式必不渲染 | 根治需本地 vendored katex(加体积)或 SW 特判跨域缓存 |
| A-29 | 开放 | 兼容 | `ai-assistant.js` 流式读取 | `AbortController`/`res.body.getReader()` 无旧内核回退 | 最低成本:检测缺失时提示"浏览器过旧" |
| A-30 | 已修(V2.1.18) | 规范 | `.gitignore` | 把 `_本地工具/校验减速器剖面动画.js` 列为临时忽略,但它是长期有用的数值校验脚本 | 已移除忽略行并 `git add` 入库(git check-ignore 确认解除) |
| A-31 | 接受 | 遗留写法 | `00_3D解剖` 两页 `document.write` importmap 回退 | 解析阻塞的 legacy 手法,但配套 es-module-shims 是有意的旧内核兜底设计 | 保留;若未来放弃旧内核可一并清理 |
| A-32 | 接受 | 设计 | `00_3D解剖/电机编码器与灵巧手3D拆解.html:359` | `console.log('[3D探针]')` 是诊断探针面板的组成部分(非调试残留) | 保留 |

## 已排除的疑似项(复查不成立)

- ~~git 历史存在硬编码 API Key~~:全库及历史扫描无 `sk-` 形态字符串;"secKey bug" 实为登记工具板块编号补零逻辑(commit ac81463)。
- ~~AI 面板上传 Key 到本站服务器~~:Key 仅存本机 localStorage,请求直连用户自选的供应商端点(13_AI答疑助手页有声明)。
- ~~首页统计占位 75/74/8/3 过时~~:与 site-sections 动态计算一致(V2.1.7 实测核对)。
