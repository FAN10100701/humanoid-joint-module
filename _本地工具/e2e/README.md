# E2E 浏览器端到端测试(Python + Playwright)

与根目录 `一键自检.ps1`(静态 37 项)互补的"浏览器层"回归:真实打开页面、点击、断言渲染与交互。

## 运行(仓库根目录)

```bash
pip install playwright          # 首次
playwright install chromium     # 首次,下载浏览器(~120MB)
python "_本地工具/e2e/e2e_test.py"          # 全量(含全站逐页 smoke,约 3~5 分钟)
python "_本地工具/e2e/e2e_test.py" --fast    # 只跑功能用例(秒级~1 分钟)
```

脚本自带本地 HTTP 服务(127.0.0.1:8123,线程内启动),无需另起服务器。

## 用例清单

| 用例 | 覆盖 |
|---|---|
| home_loads | 首页标题/导航/无未捕获异常 |
| service_worker | SW 注册成功(127.0.0.1 为安全上下文) |
| search_flow | 打开搜索→输入 FOC→有命中(E2E 首轮曾抓出"拉丁别名零命中"真实缺陷) |
| theme_toggle | 双主题切换 + 刷新持久化(body[data-theme]) |
| done_button | 打卡写入 localStorage |
| quiz_mistakes_flow | 自测答错→自动入错题本→到期复习→答对升档(① 核心链路) |
| glossary_anki | 词典页导出 Anki CSV(下载事件+内容断言) |
| heatmap_annual | 数据分析页 12 周↔12 个月热力图切换 |
| plan_generator | 路径页日期化计划表生成 |
| ai_no_key | AI 答疑无 Key 时的友好错误提示 |
| page_404 | 404 页无异常 |
| katex_render | 公式渲染(仅在线环境,离线自动 SKIP) |
| full_site_smoke | search-index 全站逐页:未捕获异常 + 同源控制台错误 + 误落 404 |

## 约定

- 本目录**豁免"校验脚本零依赖"硬规则**(AGENTS.md 硬规则 4 注):允许 Python+Playwright 开发依赖,仅本地/CI 使用,不入站点部署白名单。
- CI:`.github/workflows/self-check.yml` 的 `e2e` job 在 push/PR 时自动跑全量。
