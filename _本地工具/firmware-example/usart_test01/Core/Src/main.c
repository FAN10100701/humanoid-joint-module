/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "memorymap.h"
#include "usart.h"
#include "gpio.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */
/* ==================================================================
   串口测试固件 —— 给 SerialLab / VOFA+ / 任意串口助手做「可解析数据源」
   接口参数（上位机必须与这里一致）：
     波特率 115200 · 数据位 8 · 无校验 · 停止位 1 · 无流控   (8-N-1)
     输出编码：纯 ASCII（不带中文），每行以 CR LF 结尾
     数据格式：key=value，同一行多组用逗号分隔，一行一个采样点
   引脚：
     USART1  PA9 = TX   PA10 = RX     <- 默认用这个
     USART2  PD5 = TX   PD6 = RX
   ================================================================== */

/* 调试串口：默认 USART1；想只换到 USART2 就把 huart1 改成 huart2 */
#define DBG_UART        (&huart1)

/* 改成 0 可关掉「双路同发」，只走 DBG_UART。
   为什么默认开：测试固件最容易卡住的失败模式就是「线接在 USART2 上，
   而固件只往 USART1 打」——上位机那时只会收到悬空引脚的噪声，
   看起来像「固件没跑」或「波特率不对」，排查会绕很大一圈。
   两路同发时，只有真正连着电脑的那一路会被读到，不会互相干扰。 */
#define DBG_UART_BOTH   1

/* 原样回发（验证 RX 通路 / 网页端「发送」）改成了**运行时开关**：
   以前要改这个宏再重编译，现在直接发一行 `set echo=1`（见下面的在线调参说明）。
   少一个编译期开关 = 少一处「改了宏忘了重烧」的坑。 */

/* 打印周期（ms）。10 Hz 足够绘图，单行也短，对解析器压力小。 */
#define DBG_PERIOD_MS   100

/* ==================================================================
   在线调参（RX 通路）—— 为什么值得有：
     改一个参数原本要「重编译 + 烧录 + 人工点 Keil」，一轮半分钟起；
     支持串口改参数之后，一轮迭代变成「发一行 → 立刻看数据」，
     AI 也才可能自己扫参（否则每改一次都要人参与烧录）。
   命令（行尾给 \n 即生效；大小写不敏感只看首字母的写法见 uart_cmd）：
     set period=200      打印周期 ms（10..5000）
     set step=100        位置阶跃周期，单位「拍」（1..10000）
     set curdiv=4        电流 = 位置误差 / 这个数（1..1000，越大电流越小）
     set poslo=1000      阶跃低目标（编码器计数）
     set poshi=3500      阶跃高目标
     set echo=1          1 = 把收到的字节原样回发（纯 RX 通路/接线自检）
     get                 读回全部参数
   回包一律是「key=value 且值都是数字」的一行 —— 例如
     cmd_get=1,period=100,step=50,curdiv=2,poslo=500,poshi=4000
   ⚠ 值刻意全用数字：一旦出现 name=period 这种非数值对，上位机就会
     建出一个永远没有数值的通道（甚至算进解析失败），反而污染判据。
   ⚠ RX 必须走中断：主循环每 100ms 才转一圈，而 115200 下一个字节只要 87us，
     轮询必然丢字节（收不全命令 = 调参看起来「没反应」）。
   ================================================================== */
#define RX_RING_SZ      128           /* 中断写入、主循环排空 */
#define RX_LINE_MAX     64
/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/

/* USER CODE BEGIN PV */
static uint32_t dbg_next_ms = 0;      /* 下一次打印的时刻（HAL_GetTick 口径） */
static int32_t  dbg_pos     = 500;    /* 位置环当前值（模拟编码器计数） */

/* ---- 可在线改的参数（`set` 改的就是这几个；默认值 = 出厂行为）---- */
static volatile uint32_t g_period_ms  = DBG_PERIOD_MS;
static volatile uint32_t g_step_ticks = 50U;    /* 位置阶跃周期（拍） */
static volatile int32_t  g_cur_div    = 2;      /* 电流 = err / g_cur_div */
static volatile int32_t  g_pos_lo     = 500;
static volatile int32_t  g_pos_hi     = 4000;
static volatile int32_t  g_echo       = 0;      /* 1 = 原样回发收到的字节 */
static volatile uint32_t g_rx_bytes   = 0;      /* RX 收到的总字节数（自诊断，随数据行上报） */

/* ---- RX：中断只负责把字节塞进环形缓冲，攒行与回显都在主循环 ----
   （中断里绝不调用阻塞发送：HAL_UART_Transmit 带超时，在 ISR 里会把中断拖死） */
static volatile uint8_t  g_rx_ring[RX_RING_SZ];
static volatile uint16_t g_rx_head = 0;         /* 中断写 */
static volatile uint16_t g_rx_tail = 0;         /* 主循环读 */
static volatile uint8_t  g_rx1_byte = 0;
static volatile uint8_t  g_rx2_byte = 0;

static char    rx_line[RX_LINE_MAX];
static uint16_t rx_len = 0;
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MPU_Config(void);
/* USER CODE BEGIN PFP */

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
/* ------------------------------------------------------------------
   极简调试打印：不重定向 printf、不依赖半主机（semihosting）。
   直接用 HAL 阻塞发送，烧进去就能从串口出字。
   ⚠ 本工程 Keil 勾了 MicroLIB（<useUlib>1</useUlib>），MicroLIB 的
     vsnprintf 不支持 %f —— 所以一律用整数 + 手工小数点，别改成 %f。
   输出格式与 SerialLab 的 FireWater 预设一致（seps = ["=", ":"]）。
   ------------------------------------------------------------------ */
static char dbg_buf[128];

static void DBG(const char *fmt, ...)
{
  va_list ap;
  int n;

  va_start(ap, fmt);
  n = vsnprintf(dbg_buf, sizeof(dbg_buf), fmt, ap);
  va_end(ap);

  if (n <= 0)
  {
    return;
  }
  if (n > (int)sizeof(dbg_buf) - 1)
  {
    n = (int)sizeof(dbg_buf) - 1;     /* 截断，绝不发出缓冲区之外的字节 */
  }
  (void)HAL_UART_Transmit(DBG_UART, (uint8_t *)dbg_buf, (uint16_t)n, 200);
#if DBG_UART_BOTH
  /* 同一份数据再走另一路：线接在 USART1 还是 USART2 都能读到。
     两路是两个独立外设、各自 115200，不会互相拖慢；只有实连电脑的那路会被看到。
     （若 DBG_UART 已被改成 huart2，就不要重复发第二遍。） */
  if (DBG_UART != &huart2)
  {
    (void)HAL_UART_Transmit(&huart2, (uint8_t *)dbg_buf, (uint16_t)n, 200);
  }
#endif
}
/* ------------------------------------------------------------------
   RX：中断侧只把字节塞进环形缓冲，攒行与回显都留给主循环。
   为什么中断里不发数据：HAL_UART_Transmit 是带超时的阻塞调用，
   在 ISR 里用会把中断拖住（而且与主循环的打印抢同一个外设）。
   ------------------------------------------------------------------ */
static void rx_isr_push(uint8_t b)
{
  uint16_t next = (uint16_t)((g_rx_head + 1U) % RX_RING_SZ);
  g_rx_bytes++;                       /* 自诊断：RX 上到底有没有字节进来 */
  if (next != g_rx_tail)              /* 满了就丢最新字节，绝不覆盖还没读走的数据 */
  {
    g_rx_ring[g_rx_head] = b;
    g_rx_head = next;
  }
}

/* ------------------------------------------------------------------
   中断向量到 HAL 的分发。
   ⚠ 本工程的 .ioc **没有勾** NVIC 里的 USART1/USART2 全局中断，于是
     CubeMX 既没在 MspInit 里 HAL_NVIC_EnableIRQ，也没在 stm32h7xx_it.c 里
     生成这两个处理函数 —— 结果 HAL_UART_Receive_IT 永远等不到回调，
     表现是「主机发出去了（桥上 ok=true），但设备像没收到一样」。
     这里手工补齐。若以后在 CubeMX 里勾上「USART1 global interrupt」，
     ⚠ 必须保持**强定义、不加 __weak**：启动文件 startup_stm32h743xx.s 里的同名函数
     本身就是 weak 桩，一旦这里也写 __weak，链接器会在两个 weak 之间选启动文件那个
     （通常是死循环），RX 一收字节就挂 —— 实测踩过，编译日志会报 L6439W。
     ⚠ 另：**不要在 CubeMX 里勾 USART 全局中断**。本工程的中断使能与处理函数都写在
     USER CODE 里（CubeMX 不会动 USER CODE），不勾它 CubeMX 就不会生成同名函数，
     也就永远不会重复定义。若你确实想让 CubeMX 生成，请先删掉这一段与下面
     HAL_NVIC_EnableIRQ 两句，再勾选重新生成。
   ------------------------------------------------------------------ */
void USART1_IRQHandler(void)
{
  HAL_UART_IRQHandler(&huart1);
}

void USART2_IRQHandler(void)
{
  HAL_UART_IRQHandler(&huart2);
}

static int rx_pop(uint8_t *out)
{
  if (g_rx_tail == g_rx_head)
  {
    return 0;
  }
  *out = g_rx_ring[g_rx_tail];
  g_rx_tail = (uint16_t)((g_rx_tail + 1U) % RX_RING_SZ);
  return 1;
}

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
  if (huart->Instance == USART1)
  {
    rx_isr_push(g_rx1_byte);
    (void)HAL_UART_Receive_IT(&huart1, (uint8_t *)&g_rx1_byte, 1);
  }
  else if (huart->Instance == USART2)
  {
    rx_isr_push(g_rx2_byte);
    (void)HAL_UART_Receive_IT(&huart2, (uint8_t *)&g_rx2_byte, 1);
  }
}

/* 十进制整数（可选负号）；成功返回 1。不用 sscanf：MicroLIB 下没必要绕那一圈。 */
static int parse_i32(const char *s, int32_t *out)
{
  int32_t v = 0;
  int     neg = 0;

  if (*s == '-') { neg = 1; s++; }
  if (*s < '0' || *s > '9') { return 0; }
  while (*s >= '0' && *s <= '9')
  {
    v = v * 10 + (int32_t)(*s - '0');
    if (v > 1000000) { v = 1000000; }     /* 先夹住，避免溢出后变成负数 */
    s++;
  }
  *out = neg ? -v : v;
  return 1;
}

/* 前三个字母不区分大小写：上位机顺手敲 `SET` 还是 `set` 都得认 */
static int ci_eq3(const char *s, char a, char b, char c)
{
  return (s[0] == a || s[0] == (char)(a - 32)) &&
         (s[1] == b || s[1] == (char)(b - 32)) &&
         (s[2] == c || s[2] == (char)(c - 32));
}

/* ------------------------------------------------------------------
   处理一行命令。回包刻意「全部是数字」：一旦出现 name=period 这种
   非数值对，上位机会建出一个永远没有数值的通道（甚至算进解析失败），
   把判据一起带脏。
   ------------------------------------------------------------------ */
static void uart_cmd(char *line)
{
  char   *eq;
  char   *val;
  char   *name;
  int32_t v;

  if (line[0] == '\0') { return; }        /* 空行不回答（回车上常多一个 \n） */

  /* ---------------- get ---------------- */
  if (ci_eq3(line, 'g', 'e', 't'))
  {
    DBG("cmd_get=1,period=%lu,step=%lu,curdiv=%ld,poslo=%ld,poshi=%ld,echo=%ld\r\n",
        (unsigned long)g_period_ms, (unsigned long)g_step_ticks,
        (long)g_cur_div, (long)g_pos_lo, (long)g_pos_hi, (long)g_echo);
    return;
  }

  /* ---------------- set name=value ---------------- */
  if (ci_eq3(line, 's', 'e', 't'))
  {
    name = line + 3;
    while (*name == ' ') { name++; }
    eq = strchr(name, '=');
    if (eq == NULL) { DBG("cmd_set=0,why=1\r\n"); return; }        /* why=1: 缺 key=value */
    *eq = '\0';
    val = eq + 1;
    if (!parse_i32(val, &v)) { DBG("cmd_set=0,why=2\r\n"); return; }  /* why=2: 值不是整数 */

    if (strcmp(name, "period") == 0)
    {
      if (v < 10) { v = 10; }
      if (v > 5000) { v = 5000; }
      g_period_ms = (uint32_t)v;
      DBG("cmd_set=1,period=%ld\r\n", (long)v);
    }
    else if (strcmp(name, "step") == 0)
    {
      if (v < 1) { v = 1; }
      if (v > 10000) { v = 10000; }
      g_step_ticks = (uint32_t)v;
      DBG("cmd_set=1,step=%ld\r\n", (long)v);
    }
    else if (strcmp(name, "curdiv") == 0)
    {
      if (v < 1) { v = 1; }              /* 除零保护：它是除数 */
      if (v > 1000) { v = 1000; }
      g_cur_div = v;
      DBG("cmd_set=1,curdiv=%ld\r\n", (long)v);
    }
    else if (strcmp(name, "poslo") == 0)
    {
      if (v < -100000) { v = -100000; }
      if (v >  100000) { v =  100000; }
      g_pos_lo = v;
      DBG("cmd_set=1,poslo=%ld\r\n", (long)v);
    }
    else if (strcmp(name, "poshi") == 0)
    {
      if (v < -100000) { v = -100000; }
      if (v >  100000) { v =  100000; }
      g_pos_hi = v;
      DBG("cmd_set=1,poshi=%ld\r\n", (long)v);
    }
    else if (strcmp(name, "echo") == 0)
    {
      g_echo = (v != 0) ? 1 : 0;
      DBG("cmd_set=1,echo=%ld\r\n", (long)g_echo);
    }
    else
    {
      DBG("cmd_set=0,why=3\r\n");        /* why=3: 不认识这个参数名 */
    }
    return;
  }

  DBG("cmd_unknown=1\r\n");
}
/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MPU Configuration--------------------------------------------------------*/
  MPU_Config();

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_USART1_UART_Init();
  MX_USART2_UART_Init();
  /* USER CODE BEGIN 2 */
  /* 上电横幅：故意不含 '=' 和 ':'，避免被文本解析器当成通道建出来。
     纯 ASCII，不含中文 —— 所以上位机用什么编码都能读对。 */
  DBG("\r\n--- usart_test01 / STM32H743ZIT6 ---\r\n");
  DBG("--- port: USART1 PA9(TX) PA10(RX) / 115200 8N1 ---\r\n");
  DBG("--- data: key=value, 10 Hz, one line per sample ---\r\n");
  DBG("--- type GET for params, SET for tuning (see main.c header) ---\r\n");

  /* RX 走中断：主循环 100ms 才转一圈，而 115200 下一个字节只要 87us，
     轮询必然丢字节（收不全命令 = 调参看起来「没反应」）。两路都开：
     打印是双路同发，上位机可能接在任意一路。
     ⚠ CubeMX 的 .ioc 没勾 NVIC，所以这里必须自己使能（否则中断永不来，
       桥上 write 报 ok=true 而设备毫无反应 —— 这个坑已写在中断分发那段注释里）。 */
  HAL_NVIC_SetPriority(USART1_IRQn, 5, 0);
  HAL_NVIC_EnableIRQ(USART1_IRQn);
  HAL_NVIC_SetPriority(USART2_IRQn, 5, 0);
  HAL_NVIC_EnableIRQ(USART2_IRQn);
  (void)HAL_UART_Receive_IT(&huart1, (uint8_t *)&g_rx1_byte, 1);
  (void)HAL_UART_Receive_IT(&huart2, (uint8_t *)&g_rx2_byte, 1);

  dbg_next_ms = HAL_GetTick() + DBG_PERIOD_MS;
  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
    {
      /* 全部声明放在块首：不依赖 C99 的「语句后声明」，AC5/AC6 都安全 */
      uint32_t now;
      uint32_t n;
      uint32_t ph;
      uint32_t period;
      uint32_t step_ticks;
      int32_t  target;
      int32_t  err;
      int32_t  cur_ma;
      int32_t  temp_dc;
      int32_t  tri;
      int32_t  rpm;
      int32_t  div;
      uint8_t  b;

      /* ---- RX：把中断收进来的字节排空 ----
         放在主循环顶部而不是打印节拍里：命令要尽快处理，不能干等最多 100ms。
         回显（set echo=1）也在这里做 —— 中断里绝不调用阻塞发送。 */
      while (rx_pop(&b))
      {
        if (g_echo)
        {
          (void)HAL_UART_Transmit(DBG_UART, &b, 1, 10);
        }
        if (b == '\n')
        {
          rx_line[rx_len] = '\0';
          uart_cmd(rx_line);
          rx_len = 0;
        }
        else if (b != '\r')
        {
          if (rx_len < (uint16_t)(RX_LINE_MAX - 1))
          {
            rx_line[rx_len++] = (char)b;
          }
          else
          {
            rx_len = 0;              /* 行太长：丢掉重来，绝不溢出缓冲 */
          }
        }
      }

      now = HAL_GetTick();
      period = g_period_ms;
      if (period < 10U) { period = 10U; }        /* 双保险：SET 已夹过，这里再兜一层 */
      if ((int32_t)(now - dbg_next_ms) >= 0)
      {
        dbg_next_ms = now + period;

        n          = now / period;                         /* 拍序号 */
        step_ticks = g_step_ticks;
        if (step_ticks < 1U) { step_ticks = 1U; }          /* 它是除数 */
        target = ((n / step_ticks) & 1U) ? g_pos_hi : g_pos_lo;   /* 位置阶跃 */

        /* ① 位置：整数一阶趋近，模拟位置环阶跃响应 */
        dbg_pos += (target - dbg_pos) / 4;
        err      = target - dbg_pos;

        /* ② 转速：三角波 0..3000，周期约 5 s */
        ph  = (n * 255U / 50U) & 0xFFU;
        tri = (ph < 128U) ? (int32_t)(ph * 3000U / 128U)
                          : (int32_t)((255U - ph) * 3000U / 128U);
        rpm = tri;

        /* ③ 电流(mA)：与位置误差成正比（模拟 P 控制输出）+ 一点固定纹波 */
        div = g_cur_div;
        if (div < 1) { div = 1; }                          /* 除零保护 */
        cur_ma = 500 + err / div;
        if (cur_ma < 0)
        {
          cur_ma = -cur_ma;
        }
        cur_ma += (int32_t)(n % 4U) * 10;

        /* ④ 温度：25.0 ℃ 起，每拍 +0.05 ℃，40 s 一个循环 */
        temp_dc = 250 + (int32_t)((n % 400U) / 2U);

        /* 一行一组，key=value，逗号分隔 —— 与 SerialLab 的 FireWater 预设
           （seps = ["=", ":"]）零配置对接；小数用整数拼，绕开 MicroLIB 无 %f
           rx = 从主机收到的累计字节数：它一直是 0 就说明「RX 方向没通」
           （接线只有 TX/GND、或对端没真发出去），不用再靠猜。 */
        DBG("tick=%lu,pos=%ld,rpm=%ld,cur=%ld.%02ld,temp=%ld.%ld,rx=%lu\r\n",
            (unsigned long)now,
            (long)dbg_pos,
            (long)rpm,
            (long)(cur_ma / 1000), (long)((cur_ma % 1000) / 10),
            (long)(temp_dc / 10),  (long)(temp_dc % 10),
            (unsigned long)g_rx_bytes);
      }
    }
  }
  /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Supply configuration update enable
  */
  HAL_PWREx_ConfigSupply(PWR_LDO_SUPPLY);

  /** Configure the main internal regulator output voltage
  */
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE3);

  while(!__HAL_PWR_GET_FLAG(PWR_FLAG_VOSRDY)) {}

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_DIV1;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI;
  RCC_OscInitStruct.PLL.PLLM = 4;
  RCC_OscInitStruct.PLL.PLLN = 16;
  RCC_OscInitStruct.PLL.PLLP = 2;
  RCC_OscInitStruct.PLL.PLLQ = 2;
  RCC_OscInitStruct.PLL.PLLR = 2;
  RCC_OscInitStruct.PLL.PLLRGE = RCC_PLL1VCIRANGE_3;
  RCC_OscInitStruct.PLL.PLLVCOSEL = RCC_PLL1VCOWIDE;
  RCC_OscInitStruct.PLL.PLLFRACN = 0;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2
                              |RCC_CLOCKTYPE_D3PCLK1|RCC_CLOCKTYPE_D1PCLK1;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.SYSCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_HCLK_DIV1;
  RCC_ClkInitStruct.APB3CLKDivider = RCC_APB3_DIV2;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_APB1_DIV4;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_APB2_DIV4;
  RCC_ClkInitStruct.APB4CLKDivider = RCC_APB4_DIV2;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK)
  {
    Error_Handler();
  }
}

/* USER CODE BEGIN 4 */

/* USER CODE END 4 */

 /* MPU Configuration */

void MPU_Config(void)
{
  MPU_Region_InitTypeDef MPU_InitStruct = {0};

  /* Disables the MPU */
  HAL_MPU_Disable();

  /** Initializes and configures the Region and the memory to be protected
  */
  MPU_InitStruct.Enable = MPU_REGION_ENABLE;
  MPU_InitStruct.Number = MPU_REGION_NUMBER0;
  MPU_InitStruct.BaseAddress = 0x0;
  MPU_InitStruct.Size = MPU_REGION_SIZE_4GB;
  MPU_InitStruct.SubRegionDisable = 0x87;
  MPU_InitStruct.TypeExtField = MPU_TEX_LEVEL0;
  MPU_InitStruct.AccessPermission = MPU_REGION_NO_ACCESS;
  MPU_InitStruct.DisableExec = MPU_INSTRUCTION_ACCESS_DISABLE;
  MPU_InitStruct.IsShareable = MPU_ACCESS_SHAREABLE;
  MPU_InitStruct.IsCacheable = MPU_ACCESS_NOT_CACHEABLE;
  MPU_InitStruct.IsBufferable = MPU_ACCESS_NOT_BUFFERABLE;

  HAL_MPU_ConfigRegion(&MPU_InitStruct);
  /* Enables the MPU */
  HAL_MPU_Enable(MPU_PRIVILEGED_DEFAULT);

}

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}

#ifdef  USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
