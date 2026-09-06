# AGENTS.md · AI 会话入口(AI agents start here)

> 人形机器人学习站:纯静态中文教学网站(HTML/CSS/JS,无构建、无后端),GitHub Pages + cyco.top 双端部署。
> 本文件是**薄入口**:只放红线与指针,细节在各专文档;改任何文档前先确认不与本文件冲突。

## 硬规则(违反必出事故,先读再动手)

1. **禁 `git add -A` / `git add .`**——只 add 指定文件(多次把并行会话半成品卷进提交的事故);commit/push 由用户确认,不自动推
2. **隐私红线**:API Key(`sk-`/`ep-` 形态)、含用户名的机器绝对路径、手机号/内网 IP 不入库;`.mimosa/ .v2c .video_agent .workbuddy .zcode .trae` 等个人目录已 gitignore(`.agents/` 仅 `skills/` 入库),勿 `git add -f`
3. **`.ps1`/`.bat` 一律 ASCII-only**:PS 5.1 把无 BOM UTF-8 当 GBK 读,中文注释会炸脚本(历史事故×2);中文字面量用 `[char]0xXXXX` 拼接
4. **站点代码保守 ES5、离线可用**;`_本地工具/*.js` 校验脚本零依赖(只用 fs/path)
5. **数据单源**:题只改 `ib-data-a/b/c.js` / `quiz-bank.js` / `quest-data.js`;统计数字只改 `site.js` 的 `S.STATS`;页面清单只改 `site-sections.js`;打卡/活动只用 `Site.toggleDone` / `Site.logActivity`
6. **新页面走完整登记清单**(见下),漏登记自检报 not in index
7. **发版五处同步**:`_本地工具/发版.ps1` 自动同步 site.js `S.VERSION` / index 当前版本行 / index 页脚 / sw.js CACHE / README 最新版本行;`CHANGELOG.md` 顶部与首页 `#version` 区块**双登记同一条**;3D 域改动另 bump `00_3D解剖/sw.js` 的 SW_VERSION / MODELS_CACHE
8. **SVG 双主题底线**:硬编码浅色 hex 是事故根源,中性注释钦定 `#64748b`;画图/修图/图片验收必走 svg-diagram-check skill 的检查循环
9. **不动他人在途文件**:编辑报 "file changed since it was read" = 并行会话在改,重读后再动;页面文件落地立即广播
10. **收口必跑** `_本地工具/一键自检.ps1` 全绿(**项数以脚本输出为准,任何文档不写死项数**);批量修复(≥10 处)写审计摘要入 `docs/审计/`,结构性 bug 按 `AUDIT.md` 约定回写台账

## 按任务找文档

| 任务 | 先读 |
|---|---|
| 新增/修改教学页 | `docs/协作/给协作者的交接说明.md` §二 + `CONTRIBUTING.md` |
| 画图/修图/SVG 验收 | `.agents/skills/svg-diagram-check/SKILL.md`(含 references/ 两份) |
| 隐患修复迭代(loop) | `docs/维护/迭代循环.md` + 台账 `AUDIT.md` |
| 发版 | `docs/维护/迭代循环.md` S5-S7 + `_本地工具/发版.ps1` |
| 发版后人工验收 | `docs/维护/逐页测试清单.md` |
| 对外贡献/PR 流程 | `CONTRIBUTING.md` |
| 图片批量迭代会话 | `docs/维护/图片迭代循环提示词.md` |

## 登记清单(新增页面)

跑 `node _本地工具/登记页面.js` **自动六处**:search-index / sitemap / page-meta / 学习地图 / index 卡片+SITE_SECTIONS ids / 百度清单;**手动三件随需**:翻页链 prev/next、新 `_assets/*.js` 进根 `sw.js` PRECACHE、学习路径相关页进 `_assets/path-data.js`;另加 CHANGELOG 顶部登记。(统一叫法是「登记清单」,历史文档里的"五件套/六处/七件套"均指它)

## 并行会话协议

- 一个文件同一时刻只有一个会话在改;编辑冲突一律重读再改,不强写
- 新页面/新数据文件落地即在本会话完成报告里声明,避免多会话重复登记
- 提交前 `git status` 核对暂存区,只提交本会话文件;发现别的会话漏登记不代改,报告出来
