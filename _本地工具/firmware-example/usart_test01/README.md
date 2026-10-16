# usart_test01 —— 串口测试固件(快照)

给 SerialLab / VOFA+ / 任意串口助手当「**可解析数据源**」用的 STM32H743ZIT6 测试固件。
这里只放**源码 + CubeMX 配置**(便于复盘、对比与回归),不含构建产物。

## 这份快照里有什么

| 内容 | 说明 |
|---|---|
| `usart_test01.ioc` | **CubeMX 配置(时钟/引脚/外设的唯一真源)** —— 复盘时钟树与串口配置看它 |
| `Core/Src` · `Core/Inc` | 应用源码。`main.c` 里是数据生成、在线调参与 RX 中断 |
| `MDK-ARM/usart_test01.uvprojx` | Keil 工程文件(相对路径,可移植) |
| `MDK-ARM/startup_stm32h743xx.s` | 启动文件。**曾经漏过它** —— 缺了会编译失败,所以随快照一起留档 |

## 这份快照里**没有**什么(以及为什么)

- **`Drivers/`(约 8 MB)** —— ST 的 HAL 库源码,由 CubeMX 生成,不是本项目写的。
  需要编译时用 CubeMX 打开 `.ioc` 重新生成即可。
- **构建产物**(`.hex` / `.axf` / `.o` / `.map` / `DebugConfig/` / `RTE/`) —— 见 `.gitignore`。
- **`.uvguix.*`** —— Keil 的窗口布局文件,**里面带本机用户名**,按站点红线 19 不入库。

## 固件提供的能力(接口契约)

| 项 | 值 |
|---|---|
| 波特率 / 帧格式 | **115200 8-N-1,无流控** |
| 输出 | **纯 ASCII**,每行 CR LF 结尾;`key=value`,逗号分隔,一行一个采样点 |
| 引脚 | USART1 `PA9(TX)` `PA10(RX)`,USART2 `PD5(TX)` `PD6(RX)`;**两路同发** |
| 数据行 | `tick=…,pos=…,rpm=…,cur=…,temp=…,rx=…`(`rx` = 累计收到的字节数,自诊断:RX 方向不通时它恒为 0) |
| 在线调参 | `set period=200` / `set step=100` / `set curdiv=8` / `set poslo=` / `set poshi=` / `set echo=1` / `get` |
| 回包 | `cmd_get=1,period=100,…` / `cmd_set=1,period=200` / `cmd_set=0,why=3` —— **值全是数字**,避免上位机建出永远没有数值的通道 |

## 编译与烧录

```powershell
# 推荐:用仓库里的迭代脚本,一条命令跑完「编 -> 烧 -> 测 -> 判 -> 记台账」
# 它会编译/烧录你的工作副本(不是这份快照),并自动回退上一版固件
powershell -ExecutionPolicy Bypass -File <tools-dir>\iter-one.ps1 -Project <你的工程>.uvprojx -Save
powershell -ExecutionPolicy Bypass -File <tools-dir>\iter-one.ps1
```

⚠ **两条硬经验(都踩过)**:
1. **工程名与路径必须是 ASCII**:中文工程名会让 ArmClang 报
   `unable to execute command: Unable to convert command-line to UTF-16`。
   这也是本快照目录名用 ASCII 的原因。
2. **RX 必须走中断,且 CubeMX 不勾 NVIC 就不会生成中断使能**:
   `.ioc` 里没有 `NVIC.USARTx_IRQn=true` 时,既没有 `HAL_NVIC_EnableIRQ`,
   `stm32h7xx_it.c` 里也没有 `USARTx_IRQHandler`,`HAL_UART_Receive_IT` 永远等不到回调
   —— 现象是「上位机发出去了、设备毫无反应」。本固件在 `USER CODE` 里手工补齐了这两段;
   **若以后在 CubeMX 里勾上该中断,请把这两段删掉,否则重复定义**。

## 与工作副本的关系(重要)

这份快照是**留档**,不是构建入口:
- 日常编译/烧录用的是你的**工作副本**(`<你的 STM32 工程目录>/usart_test01`),
  迭代脚本默认也编它。
- 改了工作副本之后,记得把变化同步回这里,否则两边会分叉
  (分叉了就失去「复盘 + 回归」的意义)。
