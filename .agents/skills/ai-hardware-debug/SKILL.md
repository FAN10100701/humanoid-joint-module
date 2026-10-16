---
name: ai-hardware-debug
description: 当任务是「让 AI 自己读串口 / 调试硬件 / 根据串口数据自动找规律并迭代」时使用本 skill。包含：为什么浏览器内侧永远无法被 AI 接管串口、本地串口桥（_本地工具/serial-bridge）的命令与 MCP 工具面、token 预算纪律（--profile=digest / --max-bytes / trial 台账）、自动迭代闭环的正确跑法与建议轮数上限、乱码与波特率与编码三类现场故障的排查顺序，以及从真实 STM32 现场得到的四条硬经验（中文路径炸 ArmClang、MicroLIB 不能用 %f、HSI 直供波特率风险、串口独占）。凡涉及串口读数据找规律、自动整定参数、闭环迭代硬件、把串口数据喂给 AI，都先读本 skill。技术权威在 _本地工具/serial-bridge/README.md 与 06_学习工具/_串口调试助手/AGENTS.md。
---

# AI 自动化串口调试 · 闭环手册

## 0. 三条铁律（违反了后面全白做）

1. **不要在浏览器里试图让 AI 接管串口。** `navigator.serial.requestPort()` 必须在**真实用户手势**的调用栈里，端口选择是浏览器原生弹窗 —— AI 既点不了也授权不了。这是平台安全红线，扩展注入 / 模拟点击都属脆弱且违规。**给人用的走网页端（SerialLab），给 AI 用的走本地桥。**
2. **两边共用同一份解析内核。** 桥直接 `require` 子应用 `js/` 下的真源模块，所以「浏览器里看到的」与「AI 拿到的」逐字节一致。**不要在桥里另写一份解析逻辑**——那会立刻产生两套口径。
3. **Token 必须有界。** AI 自己不会主动克制：一次 `read` 的完整输出在 200 帧时是 **74KB（≈2 万 token）**，跑 20 轮就是 **40 万 token**。所以：默认预算、只读结论、不读原始数据。

## 1. 桥的定位与最小可用命令

```
_本地工具/serial-bridge/bridge.mjs     (Node + serialport，仅此一个第三方依赖)
```

| 命令 | 需要硬件 | 用途 |
|---|---|---|
| `list` | 否 | 枚举本机串口 |
| `read --ms N --preset P --out cap.json` | 是 | 采一段并解析，`--out` 落**完整**数据 |
| `write --hex "..." \| --text "..."` | 是 | 写串口（⚠ 危险动作，见 §6） |
| `parse --hex/--bin/--hex-file/--text-file` | **否** | 离线按规则重放 —— **调协议规则的主力** |
| `assert --in cap.json --expect "rpm>1750; cur.max<3.2"` | 否 | 阈值判定，退出码 0 通过 / 2 不通过 |
| `trial append --in cap.json --expect "..." --note "kp 8→10"` | 否 | 把一轮压成一行结论写进台账 |
| `trial list --last 10` | 否 | 读台账最近几轮 + 指标趋势方向 |
| `selftest` | 否 | 四套内置协议自检（改内核后第一道闸） |

**没有硬件也能先跑通 `parse` / `assert` / `trial` / `selftest`** —— 用一份已有的 `dump.bin` 反复重放，把规则调准了再上真机。

## 2. Token 预算纪律（本 skill 最重要的一节）

| 手段 | 效果 |
|---|---|
| `--max-bytes <N>`（**默认 12000**） | stdout 超预算自动降级为 digest 并在结果里标 `trimmed: true`。**默认就带预算**，不需要 AI 自觉 |
| `--profile=digest` | 只回「通道统计 + 帧结构 + 失败样本 + 提示」，丢 `brief` / `samples` / `recent` / 完整调试包。**实测 74018 → 3752 字节（省 95%）** |
| `--out <file>` | **永远是完整数据**，不受预算影响。数据不丢，只是不进上下文 |
| `trial` 台账 + `--max-rounds`（默认 20） | 每轮一行；`trial list --last 5` 约 1KB。达到轮数上限后 `append` 以**退出码 3** 拒绝并标 `budgetExhausted` —— 这是「不能无限循环」的**机制保证**，不依赖 AI 自觉 |
| `--bundle=false` | 连调试包也不带上（更省，但 AI 会失去「帧结构说明」） |

**正确姿势**：

```bash
# 一次迭代只花 ~4KB：完整数据落盘 + stdout 只回结论
node bridge.mjs read --ms 3000 --preset firewater --out cap.json      # stdout 自动 digest
node bridge.mjs trial append --in cap.json --expect "rpm>1750" --note "kp 8→10" --max-rounds 20
node bridge.mjs trial list --last 5                                    # 读趋势 + 剩余轮数，不读原始数据
```

**反模式（会烧光上下文，禁止）**：

- ❌ 把 `--out` 那个 70KB 的 JSON 整个读进上下文（要指标就读 `assert` / `trial` 的结论）
- ❌ 不加 `--ms` 上限就 `read`（最长 600000ms = 10 分钟，帧数无上限）
- ❌ 跑没有终止条件的循环。**迭代必须有界**：先声明判据与轮数上限（建议 10~20 轮），达标或超限即停 —— 并且用 `--max-rounds` **让工具替你兜底**（超限返回退出码 3），别只靠记性
- ❌ 用 `--human` 之外的散文当机器输入（`--human` 给人看，AI 要 JSON）

## 3. 自动闭环的标准跑法

```
      ┌──────────────── 迭代 n（先定上限！）────────────────┐
      │                                                     │
 [1] read  --ms 3000 --out trial-n.json   ← stdout 自动 digest
      │
 [2] trial append --in trial-n.json --expect "<判据>" --note "<这轮改了什么>"
      │         └─ 退出码 0 = 达标收工；2 = 未达标，看 actual/expect 定位
 [3] 改代码 / 改参数
      │
 [4] 重新烧录（⚠ 必须人工确认，见 §6）
      │
      └─────────────→ 回到 [1]，直到达标或轮数超限
```

**没有硬件时的离线等价跑法**（调规则、验判据全靠它）：

```bash
node bridge.mjs parse --bin dump.bin --rule rule.json --out trial-n.json
node bridge.mjs trial append --in trial-n.json --expect "..."
```

**判据必须先定义再迭代。** 没有客观判据，AI 只会瞎调 —— 先把指标写进 `expect`（超调 / 上升时间 / 稳态误差 / 纹波 / 温升），不达标即 fail。

### 3.1 一条命令跑完一整轮（`_本地工具/迭代一轮.ps1`，推荐）

上面 [1]~[4] 手工串起来是半分钟一轮。现在有脚本把它压成一条命令：
**编译 → 烧录 → 采样 → 判据 → 记台账**，实测 **14 秒**走完（含烧录），退出码即结论。

```powershell
# 首次：把本机设置（Keil / CubeProgrammer / 工程路径）存进 gitignore 的 _data 目录
powershell -ExecutionPolicy Bypass -File <tools>\<script> -Project <工程>.uvprojx -Save
# 之后：一条命令，不带参数
powershell -ExecutionPolicy Bypass -File <tools>\<script>
```

| 退出码 | 含义 | 脚本动作 |
|---|---|---|
| `0` | 全部判据 PASS | — |
| `2` | 编译失败 | **自动回退**上一版固件 |
| `3` | 烧录失败 | **自动回退** |
| `4` | 有判据 FAIL | **不回退**——那正是迭代要的信息，已记进台账 |
| `5` | 轮数预算用尽 | 停下汇报（桥返回 3） |

判据集在同目录 `serial-judge.json`：顶层 `ms` 声明**判据假设的采样窗口**，
`groups[]` 每组 `{name, expect, desc}`。**窗口必须 ≥ 判据所需**（例如「位置走完阶跃行程」
要 ≥ 一个阶跃周期），否则健康固件会被误判 FAIL——脚本会取「配置与判据中的较大者」。

### 3.2 激励-响应：发一条命令、看它的回包

```bash
# ✅ 正确：一次端口占用里先发后收
node bridge.mjs read --send "get" --send-delay 400 --ms 1500 --preset firewater
# ❌ 错误：分两次调用 —— read 占着端口时 write 会**静默失败**，
#    采集里字节数恒定不变，现象和「设备没收到」一模一样（实测白查了半天）
```

**优先让固件支持在线调参**（串口收 `set name=value` / `get`）。收益极大：
改一个参数从「重编译 + 烧录 + 人工点 Keil」（半分钟、且必须有人参与）
变成「发一行 + 立刻看数据」（一秒）。**这是唯一能让 AI 自己扫参的前提**——
否则每一轮迭代都要人肉烧录，闭环就断了。

固件侧三个必须注意的点（都在本仓库 `usart_test01` 里踩过）：
1. **RX 必须走中断**：主循环 100ms 才转一圈，而 115200 下一个字节只要 87µs，轮询必然丢字节
   → 收不全命令，看起来像「调参没反应」。
2. **CubeMX 不勾 NVIC 就不会生成中断使能**：`.ioc` 里没有 `NVIC.USART1_IRQn=true` 时，
   既没有 `HAL_NVIC_EnableIRQ`，`stm32h7xx_it.c` 里也没有 `USART1_IRQHandler`
   → `HAL_UART_Receive_IT` 永远等不到回调。此时 bridge 的 `write` 会报 `ok=true`
   而设备毫无反应，**必须在固件里手工补齐**（并注意别与生成代码重复定义）。
3. **回包的值全用数字**：形如 `cmd_get=1,period=100,...`。一旦出现 `name=period`
   这种非数值对，上位机会建出一个永远没有数值的通道（甚至算进解析失败），把判据一起带脏。
   再加一个 `rx=<累计收到字节数>` 随数据行上报——它一直是 0 就说明 RX 方向没通，
   不用再靠猜（接线只有 TX/GND、或对端根本没发）。

## 4. MCP 工具面（配好后 AI 原生可调）

桥内置 MCP stdio 服务（`bridge.mjs mcp`），暴露 6 个工具：

| 工具 | 对应命令 |
|---|---|
| `serial_list` | `list` |
| `serial_read` | `read`（含 `profile` / `maxBytes` / `bundle` 省流参数） |
| `serial_write` | `write` |
| `serial_parse` | `parse`（含 `profile` / `maxBytes` / `bundle`） |
| `serial_assert` | `assert` |
| `serial_trial` | `trial`（`sub: "append" \| "list"`） |

配置方式见 `_本地工具/serial-bridge/README.md` 第五节（DSH 走 `cordis.patch.yml`；WorkBuddy 走 `.workbuddy/mcp.json`，可抄 `mcp.example.json`）。配完**需要在连接器管理里对新 server 点一次「信任」**才激活。

## 5. 现场故障排查顺序（乱码 / 没数据）

**乱码三分诊，按成本从低到高**：

1. **波特率**（第一大原因，且最便宜）。别急着上自动扫描 —— 先核对固件源码里的 `BaudRate` 与上位机是否一致。**真实事故**：固件是 `921600`、上位机是 `115200`，差 8 倍 → 满屏乱码。改上位机一行就好。
2. **编码**。中文设备常见 GBK。注意 Web Serial 在操作系统层就已按波特率完成电平采样，**波特率错配无法从字节流逆推**，但编码错配可以在字节层直接识别。
3. **它本来是二进制协议**，被当文本看了 → 切 HEX 显示 / 去「解析」页配帧结构。

**波特率自动扫描的正确用法与已知坑**：

- 打分口径 = 「像不像文本」与「按当前 HEX 规则试解出的帧成功率」**取较高者**。
- ⚠ **二进制协议要先把「解析」页签切到 HEX 并配好帧结构**，否则只按文本判分，HEX 帧永远扫不出来。
- ⚠ 每档都要**重开端口**：Arduino / ESP 会因此反复复位；本版会尝试压住 DTR/RTS 并给每档留预热窗口，**能减轻但不能保证消除**。
- ⚠ 设备若「上电几秒后才开始打印」或只应答不主动发，扫描采不到东西 → 调大「每档采样」时长（默认 700ms）或改成主动连续发送。

## 6. 安全边界（自动化里最危险的两处）

- **`write` 无二次确认**（命令行工具不做交互确认，避免阻塞脚本）。AI 自主闭环里一条误判的 `--hex` 就可能改波特率、擦 Flash、让电机乱转。**建议：只在受控测试环境让 AI 自主写；量产/真机前给 `write` 加白名单或人工闸。**
- **烧录必须人工确认。** AI 只自动跑「读 + 判」，烧录步骤留给人，且先备份原固件。

## 7. 从真实 STM32 现场得到的四条硬经验

> 这四条全是实际踩出来的，与「串口助手」本身无关，但会让整个闭环卡死，所以写在这里。

1. **中文工程名/路径会打死 ArmClang。** 报错形如
   `ArmClang.exe: error: unable to execute command: Unable to convert command-line to UTF-16`，
   且**每个源文件都失败**（看起来像"25 个错误"）。根因是 Keil 把 `TargetName/OutputName/OutputDirectory`
   里的中文拼进了编译器命令行。**工程名与路径一律 ASCII**。同理，`.ps1`/`.bat` 也要 ASCII-only。
2. **Keil 勾了 MicroLIB 就不能用 `%f`。** MicroLIB 的 `vsnprintf` 不支持浮点格式符，`%f` 会静默输出空值或乱值。**用整数 + 手工小数点**（如 `%ld.%02ld`）打印小数。
3. **HSI 直供做串口时钟有风险。** H7 的 HSI64 全温区精度可达 ±3~4%，接近 UART 的容错极限。做链路验证够用，**量产/长测请改 HSE + PLL**。另外要核对 CubeMX 的 `.ioc` 与生成代码是否自洽（真实事故：`.ioc` 写 USART 时钟 80MHz，而生成代码的 PLL2 分频算出来是 40MHz，差 2 倍）。
4. **串口是独占的。** 浏览器和本地桥**不能同时开同一个 COM 口**；先断开网页端再让桥读，反之亦然。

## 8. 与网页端的分工（别重复造）

| | 网页端 SerialLab | 本地桥 |
|---|---|---|
| 使用者 | 人 | AI / 脚本 |
| 端口选择 | 浏览器原生弹窗（人点） | 命令行参数 / 自动取首个 |
| 交互 | 实时 GUI、波形、面板 | 一次性采一段 → 结构化 JSON |
| 解析内核 | 同一份 | **同一份** |
| 调试包 | `exporters.debugBundle()` | **同一个函数** |

人在网页上看到波形异常 → 把配置导出（`--settings cfg.json`）给桥 → AI 用**同一套规则**在命令行复现并做断言。**这才是「不用复制粘贴」的正解**。
