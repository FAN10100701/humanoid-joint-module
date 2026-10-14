# SerialLab 本地串口桥（serial-bridge）

**解决的问题**：网页版串口调试助手受浏览器安全模型限制——`navigator.serial.requestPort()` 必须由真实用户手势触发，端口选择是浏览器原生弹窗，AI Agent 无法接管。所以**网页永远只能给人用**。

本桥把同一套解析内核搬到 Node 里跑，让 AI Agent 能**自己打开串口、自己读数据、自己判定通过与否**，全程不需要人复制粘贴。

> 关键设计：桥 `require` 的是子应用的**真源码**（`06_学习工具/_串口调试助手/js/` 下的 10 个 UMD 模块），不是重新实现的简化版。因此桥解析出的通道、统计量、调试包与网页端**逐字节同源**——在浏览器里看到的现象，AI 在命令行/接口里看到的是同一份。

---

## 一、目录位置与依赖

```
_本地工具/serial-bridge/
├── bridge.mjs          # 全部逻辑（约 840 行，零第三方依赖，仅标准库 + serialport）
├── package.json
├── README.md           # 本文件
└── node_modules/       # 安装 serialport 后生成（已在 .gitignore 排除，不入库）
```

**依赖矩阵**（重要）：

| 命令 | 是否需要 `serialport` | 是否需要真实硬件 |
|---|---|---|
| `list` | 是 | 否（枚举系统串口） |
| `read` | 是 | 是 |
| `write` | 是 | 是 |
| `parse` | 否 | 否 |
| `assert` | 否 | 否 |
| `selftest` | 否 | 否 |
| `mcp` | 是（用到对应工具时按需加载） | 视工具而定 |

也就是说：**没装硬件、没装 native 依赖，也能先把 `parse` / `assert` / `selftest` 跑通**，这是离线迭代规则的主要手段。

## 二、安装

```bash
cd _本地工具/serial-bridge
npm install
```

只装一个包：`serialport`（^13.0.0，含 N-API 预编译二进制，无需本机编译工具链）。

**已验证的 Node 版本**：

- 受管 Node `v22.22.2` ✅
- 系统 Node `v24.19.0` ✅（N-API 兼容，可加载 serialport）

两者都可以直接用 `node` 启动，不需要额外指定 `NODE_PATH`。

## 三、命令行用法

### 1）`list` —— 枚举本机串口

```bash
node bridge.mjs list
node bridge.mjs list --human
```

输出：`count` / `ports[]`（`path` / `manufacturer` / `serialNumber` / `vendorId` / `productId`）。

> 即使没装 `serialport`，`list` 也不报错退出，而是在 `note` 字段里说明原因、返回空列表——保证 Agent 调用时拿到的是结构化结果而非崩溃。

### 2）`read` —— 采一段并解析

```bash
node bridge.mjs read --ms 3000 --port COM4 --baud 115200 --preset justfloat --out capture.json
node bridge.mjs read --ms 2000 --preset firewater --human
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `--ms` | 2000 | 采集时长（ms），范围 100 ~ 600000 |
| `--port` | 自动取第一个 | 串口名，如 `COM4`；找不到会报错并列出可用串口 |
| `--baud` | 115200 | 波特率 |
| `--databits` / `--stopbits` / `--parity` | 8 / 1 / none | 帧格式 |
| `--preset` | — | 内置协议预设，见第四节 |
| `--samples` | 200 | 调试包里带多少帧样本（20~5000） |
| `--out` | — | 把结构化结果写成 JSON 文件（后续 `assert --in` 用） |
| `--bundle=false` | 带 | 关掉则**不**附带 `debugBundle`，输出更小 |
| `--human` | — | 输出人读摘要而非 JSON |

**输出结构**（JSON 模式）：

```jsonc
{
  "ok": true,                  // 本次采集是否零失败帧
  "mode": "hex",               // 生效的解析模式：hex（二进制分帧）/ text（分行）
  "bytes": 6144, "lines": 0, "frames": 512, "failed": 0,
  "rawRecords": 512,           // 原始收发记录条数
  "channels": {                // 每个通道的窗口统计
    "temp": { "value": 25.3, "min": 24.9, "max": 26.1, "avg": 25.4, "span": 1.2, "unit": "℃", "count": 128 }
  },
  "failures": [ { "tAbs": "...", "hex": "...", "reason": "校验和不匹配" } ],
  "recent": [ { "tAbs": "...", "dir": "RX", "hex": "...", "values": {...} } ],
  "port": "COM4",
  "serial": { "baudRate": 115200, "dataBits": 8, "stopBits": 1, "parity": "none" },
  "durationMs": 3000,
  "ruleMode": "hex",
  "capturedHex": "AA AA 01 ...",     // 原始字节（超 4096 字节截断）
  "debugBundle": { ... }             // 与网页端「导出 AI 调试包」完全同一个函数产出
}
```

### 3）`write` —— 向串口发数据

```bash
node bridge.mjs write --hex "AA 55 01"
node bridge.mjs write --text "AT+MODE=1"
node bridge.mjs write --text "raw" --newline=false
```

**⚠️ 危险动作**：写串口可能让设备进入未知状态（改波特率、擦 Flash、启动电机）。请确认端口正确、报文正确后再执行。

### 4）`parse` —— 离线解析已有字节（不碰硬件）

```bash
# 十六进制字符串
node bridge.mjs parse --hex "AA AA 01 06 00 64 00 32 00 00 F1" --preset ano10 --human

# 二进制文件 / 十六进制文本文件 / 纯文本文件
node bridge.mjs parse --bin dump.bin --preset justfloat
node bridge.mjs parse --hex-file dump.hex --rule rule.json
node bridge.mjs parse --text-file log.txt --preset firewater --out parsed.json
```

字节按 **512 字节一块**喂进解析器，模拟真实串口的分块到达——**顺带验证跨块分帧**是否正确。这是"改规则 → 用旧数据重放 → 看分帧对不对"的核心闭环手段。

`parse` 与 `read` 一样会附带 `debugBundle`（`--bundle=false` 可关、`--samples` 可控条数），所以**没有硬件也能产出与网页端同源的一份调试包**。

> `--human` 模式会明确给出失败原因，例如：
> `→ 校验和不匹配（expect=F1 got=4B）`

### 5）`assert` —— 阈值判定（自动迭代的判据入口）

```bash
node bridge.mjs assert --in capture.json --expect "rpm>1750; cur.max<3.2"
node bridge.mjs assert --in capture.json --expect "temp<40; volt.span<=0.5" --out trial.json
```

**判据语法**：

```
<通道名>[.<统计量>] <比较符> <数值>
```

- 统计量（可省）：`.min` / `.max` / `.avg` / `.span` / `.value`
  - **裸通道名 = 最后一次值**（等价 `.value`）
  - `.min/.max/.avg/.span` = 整个采集窗口的统计量
- 比较符：`>` `<` `>=` `<=` `==` `!=`
- 多条判据用 `;` 分隔，**全部通过才算 PASS**

**退出码**（Agent 靠它做分支，不需要解析文本）：

| 码 | 含义 |
|---|---|
| `0` | 全部判据通过 |
| `2` | 有判据不通过（附全部指标明细） |
| `1` | 用法错误 / 运行错误（如通道名不存在） |

失败时输出里会给出 `expr` / `actual` / `expect` / `key` / `field`，AI 能直接据此定位是哪个通道、哪项统计量偏了。

### 6）`selftest` —— 自检（不需要硬件）

```bash
node bridge.mjs selftest
```

用 4 套内置协议预设各自造一段字节喂进内核，校验解析结果：

| 预设 | 协议 | 期望 |
|---|---|---|
| `firewater` | 文本 `name:value` | `temp:25.3 / cur:1.02 / rpm:1800` |
| `teleplot` | 文本 `>name:value` | `rpm:1800` |
| `justfloat` | float32 LE ×4 + 尾 `00 00 80 7F` | `ch1..ch4 = 0/1/2/3` |
| `ano10` | 匿名 V1.0（`AA AA` 帧头 + SUM8） | `func:1 / x:1 / y:0.5 / z:0` |

全绿输出 `{"ok": true, ...}`。这是修改内核后回归的第一道闸。

### 7）`mcp` —— 以 MCP stdio 服务运行

```bash
node bridge.mjs mcp
```

详见第五节。

## 四、解析规则来源（四选一，优先级从高到低）

| 来源 | 参数 | 用途 |
|---|---|---|
| 内联 JSON | `--rule-inline '<json>'` | 一次性微调，最灵活 |
| 规则文件 | `--rule rule.json` | 也可直接给整份配置（自动取 `rule` 段） |
| 浏览器配置 | `--settings cfg.json` | **在网页端调好规则 → 导出配置 → 桥直接复用**，这是人机衔接的关键路径 |
| 内置预设 | `--preset <id>` | 快速验证 |

**内置预设 id**：`firewater` / `teleplot` / `justfloat` / `ano10`

`--settings` 走的是内核的 `migrateConfig()`，所以旧版本导出的配置也能自动升级到当前 `CFG_VERSION`。

## 五、MCP 接入（让 Agent 原生调用）

桥内置 MCP（Model Context Protocol）stdio 服务，暴露 5 个工具：

| 工具名 | 对应命令 | 说明 |
|---|---|---|
| `serial_list` | `list` | 枚举本机串口 |
| `serial_read` | `read` | 采一段并返回解析结果 + 调试包 |
| `serial_write` | `write` | 写串口（`hex` 或 `text`） |
| `serial_parse` | `parse` | 离线解析给定字节 |
| `serial_assert` | `assert` | 按阈值判定，返回 pass/fail 与全部指标 |

### 配置片段

在 WorkBuddy 的 MCP 配置文件 `C:\Users\<用户名>\.workbuddy\mcp.json` 里加入：

```json
{
  "mcpServers": {
    "seriallab": {
      "command": "node",
      "args": [
        "<本项目根目录的绝对路径>/_本地工具/serial-bridge/bridge.mjs",
        "mcp"
      ]
    }
  }
}
```

> **路径要用绝对路径**。Windows 下斜杠 `/` 和反斜杠 `\\` 都能识别，但 JSON 里反斜杠必须写成 `\\`，所以推荐直接用 `/`。
>
> 可直接抄 `_本地工具/serial-bridge/mcp.example.json`，把其中的占位路径换成你本机的真实路径。
>
> **`command` 用 `node` 即可**——已验证系统 Node v24 与受管 Node v22 都能加载 `serialport`。若你的环境 `node` 不在 PATH，把它换成 Node 可执行文件的绝对路径。

配置写完后**不会自动生效**：需要到连接器管理页右上角的「自定义连接器」入口，对新出现的 server 点一次「信任」，才会激活。

### MCP 服务的工程细节

- 服务端**劫持了 `process.stdout.write`**，把各命令的输出收集成字符串再塞进 JSON-RPC 的 `content[].text`。否则命令的裸输出会污染协议流、把 MCP 连接打坏。
- `mcp` 是**长驻服务**，不会像其他命令那样跑完就退出。
- 已实测握手 / `tools/list` / `tools/call` 三条路径全部正确应答。

## 六、给 AI Agent 的推荐工作流（读 → 判 → 改 → 烧 → 再跑）

```
1. serial_list                        → 确认目标串口在线
2. serial_read  { ms, preset, out }   → 采一份现场数据，落 capture.json
3. serial_assert { input, expect }    → 判定是否达标；退出码 0 / 2
       ├─ 0 → 采集符合预期，进入下一步验证或收工
       └─ 2 → 拿到 actual / expect，定位是哪条通道哪项统计量偏了
4. 修改代码 / 参数
5. 重新烧录（这一步通常仍需人或其他工具）
6. 回到 2，用同一组 expect 复测 → 形成可回归的迭代闭环
```

`parse` / `assert` 不依赖硬件，所以调协议规则时可以在**没有设备**的情况下反复重放同一份 `dump.bin`，直到分帧完全正确再上真机。

## 七、与网页端的关系

| | 网页版（SerialLab） | 本地桥（serial-bridge） |
|---|---|---|
| 使用者 | 人 | AI Agent / 脚本 |
| 运行位置 | 浏览器 | Node |
| 端口选择 | 浏览器原生弹窗（人点击） | 命令行参数 / 自动取首个 |
| 交互 | 实时 GUI、波形、控件 | 一次性采一段 → 返回结构化 JSON |
| 解析内核 | 同一份 | **同一份**（直接 require 真源） |
| 调试包 | `exporters.debugBundle()` | **同一个函数** |

两者的**分工不重叠、结果可互相对照**：人在网页上看到的波形异常，可以把配置导出给桥，让 AI 用同一套规则在命令行里复现并做断言。

## 八、已知边界

- **固定时长采集**：`read` 是"采 N 毫秒然后关串口"，不是流式长跑。需要长时监听请配合网页端的文件落盘（`aichan` 模块）或 `serial-inbox.py` 收件箱。
- **`--human` 只覆盖部分命令**：`list` / `read` / `parse` / `write` 有人读摘要，`assert` 有自己的 verdict 文本。
- **串口独占**：同一串口被浏览器或其他程序打开时，桥打开会失败。这是操作系统层面的互斥，不是桥的限制。
- **`write` 无二次确认**：命令行工具不做交互确认（避免阻塞脚本），危险由使用者自负。

## 九、相关文件

- 网页端子应用：`06_学习工具/_串口调试助手/`
- 内核模块（被桥 require 的真源）：`06_学习工具/_串口调试助手/js/{util,core,codec,expr,parser,fft,datastore,timeline,exporters}.js`
- HTTP 收件箱：`_本地工具/serial-inbox.py`
- 校验脚本：`_本地工具/校验串口应用.js`
