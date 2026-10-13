# E2E 浏览器端到端测试(Python + Playwright)

与根目录 `一键自检.ps1`(静态检查,项数以脚本输出为准)互补的"浏览器层"回归:真实打开页面、点击、断言渲染与交互。

## 运行(仓库根目录)

```bash
pip install playwright          # 首次
playwright install chromium     # 首次,下载浏览器(~120MB)
python "_本地工具/e2e/e2e_test.py"          # 全量(含全站逐页 smoke,约 3~5 分钟)
python "_本地工具/e2e/e2e_test.py" --fast    # 只跑功能用例(秒级~1 分钟)
```

脚本自带本地 HTTP 服务(优先 127.0.0.1:8123,线程内启动),无需另起服务器。
若 8123 已被占用(残留的本地服务器、另一路 E2E 等),会自动顺延到 8124/8125/8126 或由系统分配空闲端口,不再整套崩在绑定那一步。

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
| serial_shell | 串口助手子应用:`SerialLab` 14 模块挂载 + 版本位 + 7 页签 + 无 Web Serial 时降级横幅与禁用连接 |
| serial_pipeline | 子应用演示模式(合成数据 50Hz)→ 预置 2 面板 → 加面板 → canvas 挂载 → 接收计数>0 → 通道表渲染 |
| serial_export | 子应用配置落盘 `humanoid-serial-config-v1` + 原始记录 CSV 下载(BOM 与数据行断言) |
| page_404 | 404 页无异常 |
| katex_render | 公式渲染(仅在线环境,离线自动 SKIP) |
| full_site_smoke | search-index 全站逐页:未捕获异常 + 同源控制台错误 + 误落 404 |

> 串口助手子应用在 `06_学习工具/_串口调试助手/`(`_` 前缀),**不进 search-index,因此 `full_site_smoke` 覆盖不到它**(AUDIT A-71);三条 `serial_*` 用例即为它的浏览器层兜底,纯函数层则由 `_本地工具/校验串口应用.js` 覆盖。

## 约定

- 本目录**豁免"校验脚本零依赖"硬规则**(AGENTS.md 硬规则 4 注):允许 Python+Playwright 开发依赖,仅本地/CI 使用,不入站点部署白名单。
- CI:`.github/workflows/self-check.yml` 的 `e2e` job 在 push/PR 时自动跑全量。
