# 贡献指南 · CONTRIBUTING

感谢你对「人形机器人学习站」感兴趣!本仓库采用 **MIT 开源协议**(见 [LICENSE](LICENSE)),
任何人都可以自由使用、修改与分发,欢迎参与共建。

> 🏫 **班级同学请先阅读 [班级协作指南](docs/协作/班级协作指南.md)**,内含权限模式、master 分支保护设置、加入步骤与安全红线。

## 你可以怎么参与

| 方式 | 说明 |
| --- | --- |
| 🐛 报 Bug | 发现链接失效、内容错误、页面打不开,提一个 [Issue](https://github.com/FAN10100701/humanoid-joint-module/issues) |
| 💡 提建议 | 新章节、新功能、体验改进,同样通过 Issue 描述 |
| 📝 贡献内容 | 写一页新的教学页,走 Fork → 修改 → Pull Request 流程 |
| 🧪 反馈体验 | 手机/电脑端浏览后,把卡顿、白屏、看不懂的地方反馈给作者 |

## 开发环境

- 纯静态站点:HTML / CSS / JavaScript,无构建步骤、无依赖安装
- 本地预览:双击 `_本地工具/启动教学页面.bat`,或任意静态服务器(`python -m http.server 8080`)
- 代码风格:保守 **ES5**(IE11 时代的兼容写法),所有脚本**离线可用**,禁止引入外部 CDN 依赖(除 3D 页面已有的回退 CDN)

## 新增一个教学页(推荐流程)

1. **复制模板**:复制 `_assets/页面模板.html` 到目标板块目录(如 `04_软件与算法/09_xxx.html`)
2. **填写 PAGE 配置**:在 `<head>` 的 `window.PAGE` 中填好 `pageId`(章节-序号,如 `04-09`)、`root`(`..`)、`breadcrumb`、`prev` / `next`(上一页/下一页互链)
3. **写内容**:严格使用模板中的组件类名(见模板注释与 `_assets/site.css`):
   - 信息框 `.box .box-tip|box-warn|box-danger|box-ok`
   - 表格 `.table-wrap > table`
   - 卡片 `.grid > .card`
   - 步骤流 `.step-flow > .step-item`
   - 自测题 `.quiz`(每页建议 3~5 题,`data-answer` 写正确选项)
   - 每页必须带「🎯 本页学习目标」与小结、思考题
4. **同步登记**(漏一处会被作者退回)——跑 `node _本地工具/登记页面.js` 自动完成六处:首页卡片网格 + `SITE_SECTIONS` ids、`_assets/search-index.js` 索引、`_assets/page-meta.js` 学习目标、`sitemap.xml`、`06_学习工具/06_学习地图.html` 节点、百度提交清单;手动两件随需:页面 `prev`/`next` 翻页链、新增 `_assets/*.js` 时登记进根 `sw.js` PRECACHE;最后在 `CHANGELOG.md` 顶部登记本期更新
5. **自查**:页面标题 / 链接 / 手机端显示 / 深浅两套主题都要正常

## 题库与数据文件维护约定(2026-08-28,V2.1.7 更新)

站内题目数据采用「数据文件单源 + 展示页 runtime 渲染」结构,**只在数据文件里改题**,展示页无需同步:

| 数据文件 | 展示页(runtime 读取) | 规则 |
| --- | --- | --- |
| `_assets/quiz-bank.js`(60 题) | `06_学习工具/03_自测题库.html`、`_assets/srs.js` | 唯一题源(CI 强制校验) |
| `_assets/ib-data-a.js`(控制类 6 学科) | `06_学习工具/11_保研复试面试题库.html` | 字段 `id/s/lv/tags/q/a/svg?/formula?/code?/a2?/follow/extend?/links` |
| `_assets/ib-data-b.js`(硬件软件 7 学科) | 同上 | 同上(字段含 `extend?`) |
| `_assets/ib-data-c.js`(通用 4 学科,V2.1.6) | 同上 | 同上;三文件合计科目/题数必须与 `_assets/site.js` 的 `S.STATS` 一致(自检 C3 校验) |
| `_assets/quest-data.js`(闯关 5 大陆 21 关) | `06_学习工具/12_闯关学习.html` | 关卡 `qs` 引用三种题源:`q:自建题 / qb:quiz-bank题号 / ref:面试题卡ID`;改题源时确认被引用关卡仍可及格 |

改完跑 `_本地工具/一键自检.ps1` 确认全绿。

## 迭代循环(LOOP,2026-09-02 起)

本站的持续优化走固定七步循环:**快检 → 读台账选题 → 修复 → 验证 → 发版 → 复盘回写 → 提交**。流程详见 [docs/维护/迭代循环.md](docs/维护/迭代循环.md),全部已知隐患与暂缓事项登记在根目录 [AUDIT.md](AUDIT.md)。两条核心纪律:

- 发现新隐患(无论是否本轮修)**先入台账再动手**,避免同一问题两处各修各的;
- 每个修复必须落到**防回归**:一键自检新检查项 / 页面 selftest 专项 / 校验脚本,三选一。

## AI API Key 纪律(2026-08-28)

「AI 答疑助手」由用户在**本机浏览器**填入自己的 DeepSeek/豆包 API Key(仅存 localStorage,见 `_assets/ai-assistant.js`)。贡献者**严禁**把任何真实 Key 写进代码、文档、Issue、PR、截图或 commit;示例一律用 `sk-xxxx`(占位)。发现泄漏:先到服务商控制台**作废该 Key**,再报告(报告里不要贴 Key 内容)。

## 修改共享文件(重要)

`_assets/site.js`(全站注入)与 `_assets/site.css`(全站样式)改动会**影响所有页面**,请:
- 尽量新增代码而非修改既有逻辑,保持向后兼容
- 样式类名避免与既有类冲突(新功能用新前缀)
- 提交 PR 时说明影响范围,并截图验证首页 + 一个教学页 + 手机端

## Pull Request 流程

1. Fork 本仓库到你的账号
2. 在 Fork 中新建分支并提交修改
3. 发起 Pull Request,标题格式建议:`feat: 新增 xx 页面` / `fix: 修复 xx 链接` / `docs: 更新 xx`
4. 描述中说明:改了什么、影响哪些页面、如何验证
5. 维护者 review 后会合并或给出修改意见

## 内容准确性约定

- 前沿事实(机型参数、算法、开源项目)必须有公开来源,并在页面「参考来源」列出来源链接
- 不确定的信息标注「待核实」,不要编造
- 引用他人资料时保留出处,尊重原作者的版权
