/* ============================================================
   人形机器人学习站 · 保研复试面试题库数据 B(硬件 / 系统类 7 学科)
   学科: 硬件电路 hw / 无人机电调 esc / ROS与编队 ros /
         C语言 c / C++ cpp / 嵌入式编程 emb / FreeRTOS frt
   字段同 ib-data-a.js; 配套页面: 08_学习工具/11_保研复试面试题库.html
   ============================================================ */
window.IB_B = {

subjects: [
  { id:'hw', name:'硬件电路 · 防反接与运放', en:'Hardware Circuits', icon:'🔌', freq:5,
    desc:'电类复试的"拉区别"题:防反接三方案、运放黄金法则、LDO 与 DCDC 选型,答得出损耗与失效模式就是工程型的证明。',
    topics:[
      { t:'防反接三方案', f:5, h:'二极管简单但压降损耗大;P-MOS 压降小;理想二极管最优雅' },
      { t:'运放虚短虚断', f:5, h:'负反馈下 V+=V−、输入无电流,两法则推一切经典电路' },
      { t:'同相/反相/差分/仪表放大', f:5, h:'增益公式+输入输出阻抗+共模抑制是三板斧' },
      { t:'比较器 vs 运放', f:4, h:'比较器开环+快+可上拉;运放当比较器用会慢且伤芯片' },
      { t:'LDO vs DCDC', f:5, h:'LDO 简单干净低效;DCDC 高效但有纹波与 EMI' },
      { t:'TVS / ESD / 退耦', f:4, h:'TVS 管浪涌、ESD 管静电;退耦电容就近供电' }
    ],
    rel:[ { t:'驱动电路模块认知', u:'../01_理论入门/03_驱动电路模块认知_交互式图解.html' },
          { t:'硬件避坑指南', u:'../02_硬件基础/04_硬件设计通用要点_避坑指南.html' } ] },

  { id:'esc', name:'无人机电调', en:'ESC for Drones', icon:'🚁', freq:4,
    desc:'多旋翼动力系统的核心:六步换相与 FOC 之争、DShot 协议、失步保护,是"玩过无人机"的最好证明。',
    topics:[
      { t:'电调的功能与组成', f:5, h:'信号解码+换相逻辑+三相逆变+电流采样+BEC' },
      { t:'方波(六步) vs FOC', f:5, h:'高速场景六步够了,安静高效低速用 FOC' },
      { t:'DShot / PWM / OneShot', f:4, h:'数字协议抗扰、无校准;DShot600 速率 600kbps' },
      { t:'失步与启动', f:4, h:'负载突变换相失败;三段式启动(定位/强拖/闭环)' },
      { t:'BEC 与供电', f:3, h:'线性 BEC 简单低效;开关 BEC 适合高压大电流' },
      { t:'动力配型', f:4, h:'推重比>2:1;电调持续电流≥电机峰值×裕量' }
    ],
    rel:[ { t:'FOC 驱动器硬件深挖', u:'../02_硬件基础/09_FOC驱动器硬件深挖.html' },
          { t:'SVPWM 交互实验室', u:'../02_硬件基础/13_功率级拓扑与SVPWM交互实验室.html' } ] },

  { id:'ros', name:'ROS 与多机编队', en:'ROS & Formation', icon:'🤖', freq:4,
    desc:'"做过 ROS 多机器人编队跟随仿真"是简历高频项目:leader-follower 几何、命名空间多机、Nav2 导航栈,从通信到控制一条线。',
    topics:[
      { t:'话题/服务/动作', f:5, h:'流数据用 Topic,同步问答用 Service,长任务用 Action' },
      { t:'TF 坐标变换树', f:5, h:'静态+动态变换组成树;查换必须"同树同刻"' },
      { t:'Leader-Follower 编队', f:5, h:'l-ψ / l-α 几何:距离+方位角即可定跟随位姿' },
      { t:'多机仿真(命名空间)', f:4, h:'每机独立 namespace,话题/TF 前缀隔离' },
      { t:'Nav2 导航栈', f:4, h:'AMCL 定位→全局规划→局部规划→代价地图' },
      { t:'ROS1 vs ROS2(DDS)', f:4, h:'DDS 去中心化、QoS 可配、实时性更好' }
    ],
    rel:[ { t:'软件学习路线图 · ROS2', u:'../06_软件与算法/01_软件学习路线图.html' },
          { t:'仿真中心', u:'../08_学习工具/08_仿真中心.html' } ] },

  { id:'c', name:'C 语言', en:'C Language', icon:'🖥️', freq:5,
    desc:'嵌入式复试的入场券:指针与数组、内存四区、volatile/static/const 三兄弟,几乎逢面必考。',
    topics:[
      { t:'指针与数组', f:5, h:'数组名=首地址(退化),sizeof 与 &arr 例外' },
      { t:'内存四区', f:5, h:'栈(自动)/堆(malloc)/全局静态区/常量区(只读)' },
      { t:'volatile', f:5, h:'禁止编译器优化读取;ISR 共享变量与 MMIO 必加' },
      { t:'static / const', f:5, h:'static 限作用域+持久化;const 只读承诺,指针修饰看右侧' },
      { t:'结构体对齐', f:4, h:'#pragma pack / __attribute__;大成员在前可省填充' },
      { t:'函数指针', f:4, h:'回调/状态机/驱动表的核心手法' },
      { t:'宏的陷阱', f:4, h:'带参宏必须括号;do{}while(0) 包多语句' }
    ],
    rel:[ { t:'代码实验室', u:'../08_学习工具/04_代码实验室.html' } ] },

  { id:'cpp', name:'C++', en:'C++', icon:'⚙️', freq:4,
    desc:'面向对象三件套+内存管理五法则+STL 是三大题源;能讲清 vtable 与智能指针实现就超过大多数考生。',
    topics:[
      { t:'封装/继承/多态', f:5, h:'多态=运行期按实际类型分发,虚函数实现' },
      { t:'虚函数与 vtable', f:5, h:'每类一张虚表,每对象一个 vptr,调用走两级寻址' },
      { t:'构造/析构顺序', f:5, h:'构造:基类→成员→本类;析构完全反向' },
      { t:'深浅拷贝与三/五法则', f:5, h:'管理资源必须自定义析构+拷贝+赋值(加移动=五)' },
      { t:'智能指针', f:5, h:'unique 独占零开销;shared 引用计数;weak 破循环' },
      { t:'STL 与迭代器失效', f:4, h:'vector 扩容全失效;erase 返回下一个迭代器' },
      { t:'RAII 与移动语义', f:4, h:'资源=对象生命周期;move 转移所有权免拷贝' }
    ],
    rel:[ { t:'软件学习路线图', u:'../06_软件与算法/01_软件学习路线图.html' } ] },

  { id:'emb', name:'嵌入式编程', en:'Embedded', icon:'🔧', freq:5,
    desc:'中断、DMA、串行总线三座大山+看门狗/低功耗,构成"能不能下车间"的判断题。',
    topics:[
      { t:'中断与 NVIC', f:5, h:'ISR 短小快;共享数据 volatile+关中断保护' },
      { t:'UART/SPI/I2C/CAN 对比', f:5, h:'两线/四线/差分多主;速率、距离、组网各不同' },
      { t:'I2C 时序与仲裁', f:4, h:'开漏+上拉;线与仲裁低地址优先' },
      { t:'DMA', f:4, h:'外设↔内存不经 CPU,节约中断与带宽' },
      { t:'看门狗', f:4, h:'独立/窗口看门狗;喂狗姿势=程序流监控' },
      { t:'Bootloader / IAP', f:4, h:'分区+跳转;APP 中断向量表重定位' },
      { t:'低功耗模式', f:3, h:'睡眠/停止/待机;唤醒源与 IO 状态保持' }
    ],
    rel:[ { t:'软件学习路线图 · 固件', u:'../06_软件与算法/01_软件学习路线图.html' },
          { t:'通信与控制算法升级路线', u:'../04_升级进阶/09_通信与控制算法升级路线.html' } ] },

  { id:'frt', name:'FreeRTOS', en:'FreeRTOS', icon:'⏱️', freq:4,
    desc:'RTOS 三问:任务怎么调度、任务间怎么通信、优先级反转怎么办——答好这三问,RTOS 面试就过关。',
    topics:[
      { t:'任务状态机', f:5, h:'运行/就绪/阻塞/挂起;阻塞让出 CPU' },
      { t:'抢占+时间片调度', f:5, h:'高优先级就绪立即抢占;同级时间片轮转' },
      { t:'任务 vs 中断', f:5, h:'ISR 用 FromISR API + portYIELD_FROM_ISR' },
      { t:'信号量/互斥量/队列', f:5, h:'队列传数据;二值信号量做同步;互斥量带优先级继承' },
      { t:'优先级反转与继承', f:5, h:'低优持有锁阻塞高优;继承临时抬优先级' },
      { t:'内存管理 heap_1~5', f:4, h:'heap_4 合并相邻空闲块,最常用' },
      { t:'栈溢出检测', f:4, h:'uxTaskGetStackHighWaterMark + 钩子函数' }
    ],
    rel:[ { t:'软件学习路线图', u:'../06_软件与算法/01_软件学习路线图.html' } ] },

  { id:'ic', name:'NPU与数字IC设计', en:'NPU & Digital IC', icon:'🔲', freq:4,
    desc:'数字 IC/芯片方向保研复试的四板斧:Verilog 与状态机、跨时钟域与 FIFO、总线协议(APB/AHB/AXI)、NPU 架构与量化——再加 UVM 验证常识就是完整画像。答题要带「综合视角」:这段代码综合成什么电路、时序违例了怎么办。',
    topics:[
      { t:'RTL → GDSII 流程', f:4, h:'前端(逻辑/综合/DFT/STA)→后端(PnR/DRC/LVS/签核);fail 回退成本递增' },
      { t:'阻塞 vs 非阻塞赋值', f:5, h:'组合 always 用 =,时序 always 用 <=;混用产生竞争冒险' },
      { t:'三段式状态机', f:4, h:'次态组合/状态寄存/输出分离;Moore 输出只看状态,Mealy 看输入' },
      { t:'异步 FIFO 与 CDC', f:5, h:'格雷码指针一位变化;深度=突发量差÷速率差;单bit两级同步' },
      { t:'APB / AHB / AXI', f:4, h:'APB 两拍慢速寄存器;AHB 单主流水;AXI 五通道+突发+outstanding' },
      { t:'脉动阵列与 INT8 量化', f:4, h:'PE 局部互落数据复用;r=s(q−z),per-channel 精度更好' },
      { t:'UVM 与覆盖率驱动', f:4, h:'sequence→sequencer→driver 分层;功能+代码覆盖率收敛' }
    ],
    rel:[ { t:'NPU与数字IC设计板块总览', u:'../10_NPU与数字IC设计/01_板块总览与学习路线.html' },
          { t:'Verilog语法与状态机', u:'../10_NPU与数字IC设计/03_Verilog语法与状态机设计.html' } ] },

  { id:'llm', name:'大模型与具身智能', en:'LLM & Embodied AI', icon:'🧠', freq:4,
    desc:'AI 方向复试新必考:Transformer 注意力、MoE 稀疏架构、SFT/RLHF/DPO 三件套、LoRA 微调与端侧部署,再加 VLA/世界模型就覆盖了具身智能面试 90% 的问题。答题要能落到显存/FLOPs 的数量级估算,这是「跑过」和「背过」的分水岭。',
    topics:[
      { t:'自注意力与多头', f:5, h:'softmax(QKᵀ/√d_k)V;除以 √d_k 防饱和;多头=多子空间' },
      { t:'MoE 稀疏激活', f:4, h:'router top-k 门控,只激活 k/N 专家;负载均衡辅助损失防塌缩' },
      { t:'SFT / RLHF / DPO', f:5, h:'SFT 模仿;RLHF=奖励模型+PPO;DPO 从偏好对直接优化省 RM' },
      { t:'LoRA 高效微调', f:4, h:'冻结 W 学低秩 ΔW=BA;可合并零推理延迟;QLoRA 4bit 底座' },
      { t:'量化与端侧部署', f:4, h:'7B FP16≈14GB;INT4 约 3.5GB;KV cache 与 paged attention' },
      { t:'VLA 视觉-语言-动作', f:4, h:'视觉编码器+LLM 主干+动作头(离散token/扩散);RT-2/OpenVLA' },
      { t:'世界模型与数据', f:3, h:'预测未来做想象规划;Open X-Embodiment 数据瓶颈与 sim2real' }
    ],
    rel:[ { t:'大模型基础与MoE架构', u:'../09_大模型与具身智能/01_大模型基础与MoE架构图解.html' },
          { t:'感知与具身智能VLA', u:'../06_软件与算法/05_感知与具身智能_VLA与世界模型.html' } ] }
],

items: [

/* ================= 硬件电路 hw ================= */
{ id:'hw-01', s:'hw', lv:5, tags:['防反接'],
  q:'电源防反接有哪些方案?各自优缺点是什么?',
  a:'<p><b>三大主流方案对比:</b></p><div class="table-wrap"><table><tr><th>方案</th><th>接法</th><th>压降/损耗</th><th>成本</th><th>适用</th></tr><tr><td>串联二极管</td><td>正极串肖特基</td><td>0.3~0.7V,大电流发热严重</td><td>最低</td><td>小电流、低成本场合</td></tr><tr><td>P-MOS(高边)</td><td>栅极分压到地,源接输入</td><td>I²R<sub>DS(on)</sub>(mΩ 级,几乎无热)</td><td>中</td><td><b>主流方案</b>,电池设备首选</td></tr><tr><td>N-MOS(低边)</td><td>串在负极回路</td><td>同上</td><td>中</td><td>地回路可抬升的场合(共地敏感设备慎用)</td></tr><tr><td>理想二极管控制器</td><td>控制器+MOS(如 LM74700)</td><td>≈20mV 级</td><td>较高</td><td>大电流/多电源或灌</td></tr></table></div><p><b>P-MOS 原理要点(常追问):</b>正确接入时体二极管先导通,源极电位抬高,栅极经分压低于源极 |V<sub>GS</sub>| 超阈值→沟道开通,体二极管被旁路;反接时 V<sub>GS</sub> 为 0 或正→MOS 截止,体二极管也反向截止,完全断路。注意 V<sub>GS</sub>|max| 限幅(稳压管保护)与耐压裕量。</p>',
  svg:'<svg viewBox="0 0 560 200" role="img" aria-label="三种防反接方案对比"><text x="10" y="18" font-size="12" fill="currentColor">① 串联二极管:简单但 0.4V/3A=1.2W 发热</text><line x1="20" y1="46" x2="60" y2="46" stroke="currentColor" stroke-width="1.6"/><path d="M60,36 L60,56 L84,46 Z" fill="none" stroke="#f59e0b" stroke-width="1.8"/><line x1="84" y1="46" x2="100" y2="46" stroke="currentColor" stroke-width="1.6"/><line x1="72" y1="34" x2="72" y2="58" stroke="#f59e0b" stroke-width="1.8"/><text x="20" y="38" font-size="10" fill="#9aa4b2">VIN+</text><text x="70" y="72" font-size="10" fill="#9aa4b2">肖特基</text><text x="10" y="98" font-size="12" fill="currentColor">② P-MOS 高边:导通后仅 I²R,几乎无热</text><line x1="20" y1="126" x2="48" y2="126" stroke="currentColor" stroke-width="1.6"/><circle cx="56" cy="126" r="4" fill="none" stroke="#58a6ff"/><line x1="60" y1="112" x2="60" y2="140" stroke="#58a6ff" stroke-width="2"/><path d="M52,118 L68,118 L60,134 Z" fill="rgba(88,166,255,.2)" stroke="#58a6ff"/><line x1="60" y1="112" x2="96" y2="112" stroke="currentColor" stroke-width="1.2"/><line x1="60" y1="140" x2="96" y2="140" stroke="currentColor" stroke-width="1.2"/><line x1="78" y1="112" x2="78" y2="140" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 3"/><line x1="96" y1="126" x2="130" y2="126" stroke="currentColor" stroke-width="1.6"/><line x1="48" y1="126" x2="40" y2="160" stroke="currentColor" stroke-width="1.2"/><circle cx="40" cy="166" r="3.4" fill="none" stroke="#9aa4b2"/><text x="30" y="184" font-size="10" fill="#9aa4b2">GND(栅极分压到地)</text><text x="108" y="118" font-size="10" fill="#9aa4b2">S</text><text x="108" y="146" font-size="10" fill="#9aa4b2">D</text><text x="300" y="30" font-size="12" fill="currentColor">③ 理想二极管控制器:</text><text x="300" y="50" font-size="11" fill="#9aa4b2">控制器监测体二极管压降,</text><text x="300" y="68" font-size="11" fill="#9aa4b2">微正向偏置即开 MOS,压降≈20mV;</text><text x="300" y="86" font-size="11" fill="#9aa4b2">反接/反灌纳秒级关断。</text><text x="300" y="116" font-size="11" fill="#22c55e">选型要点:Vds≥2×最高输入,</text><text x="300" y="134" font-size="11" fill="#22c55e">Rds(on)按发热≤1/3 定,</text><text x="300" y="152" font-size="11" fill="#22c55e">栅极稳压管保护 |Vgs|。</text></svg>',
  follow:['P-MOS 防反接的体二极管在启动瞬间起什么作用?','N-MOS 放低边有什么隐患(地电位抬升)?'],
  links:[{t:'硬件避坑指南',u:'../02_硬件基础/04_硬件设计通用要点_避坑指南.html'},{t:'驱动电路模块认知',u:'../01_理论入门/03_驱动电路模块认知_交互式图解.html'}] },

{ id:'hw-02', s:'hw', lv:5, tags:['运放','虚短虚断'],
  q:'运放的"虚短"与"虚断"是什么?分别基于什么假设?',
  a:'<p><b>两大黄金法则(负反馈条件下):</b></p><ul><li><b>虚断:</b>运放输入阻抗极高(MΩ~GΩ),两输入端电流 ≈0——<b>基于"输入不取电流"</b>,几乎总是成立。</li><li><b>虚短:</b>深度负反馈下,输出会自动调整使 V<sub>+</sub>≈V<sub>−</sub>(差值=V<sub>out</sub>/A<sub>ol</sub>,A<sub>ol</sub>=10⁵~10⁷,故差值 μV 级)——<b>基于"开环增益极大 + 负反馈"</b>。开环/正反馈(比较器、施密特)时虚短不成立!</li></ul><p><b>用法套路:</b>任何负反馈运放电路,列两方程:①V+=V−(虚短);②节点电流定律+输入端无电流(虚断)。同相放大器:V−分压=V in →增益 1+R₂/R₁;反相放大器:V−=虚地=0 →增益 −R₂/R₁;差分/加减/积分微分同法秒解。面试常设陷阱:"比较器电路里能用虚短吗?"答:不能,比较器开环,V+ 与 V− 可以差很大。</p>',
  follow:['虚地是什么?反相放大器的"地"为什么是虚地?','为什么比较器电路不能用虚短分析?'] },

{ id:'hw-03', s:'hw', lv:5, tags:['同相','反相','差分','仪表放大'],
  q:'比较同相放大、反相放大、差分放大、仪表放大器(INA)。',
  a:'<div class="table-wrap"><table><tr><th></th><th>增益</th><th>输入阻抗</th><th>共模抑制</th><th>特点/用途</th></tr><tr><td>同相</td><td>1+R₂/R₁(≥1)</td><td>极高(直接进运放)</td><td>一般</td><td>高阻缓冲;但共模电压=输入,要求 CMRR 高</td></tr><tr><td>反相</td><td>−R₂/R₁</td><td>=R₁(不高)</td><td>好(虚地,共模≈0)</td><td>加法器/积分器;信号源内阻影响精度</td></tr><tr><td>差分(单运放)</td><td>R₂/R₁</td><td>不高且两输入不对称</td><td>中,电阻匹配是瓶颈</td><td>桥式信号粗放大</td></tr><tr><td>仪表放大 INA</td><td>Gain=1+49.4k/R<sub>G</sub>(AD623 类)</td><td>两输入都极高(前置缓冲)</td><td><b>极高(>100dB,激光修调电阻)</b></td><td>惠斯通电桥/ECG/热电偶等微弱差分信号首选</td></tr></table></div><p><b>INA 结构本质:</b>两级——前级两个同相缓冲放大差模,后级差分电路。电阻在片内激光修配,CMRR 不靠外接电阻运气;增益一只 R<sub>G</sub> 决定。人形机器人六维力传感器的电桥输出就是 INA 的教科书应用。</p>',
  follow:['为什么仪表放大器 CMRR 比分立差分电路高?','电流采样放大为什么常用差分+高共模(如 INA240)?'],
  links:[{t:'传感器专题 · 惠斯通电桥',u:'../02_硬件基础/10_传感器专题_IMU力矩与触觉.html'}] },

{ id:'hw-04', s:'hw', lv:4, tags:['比较器','迟滞'],
  q:'比较器和运放有什么区别?什么是迟滞比较器(施密特触发)?',
  a:'<p><b>区别:</b></p><ul><li><b>工作区:</b>比较器开环/正反馈设计,输出只有两种状态(轨到轨或 OC 上拉);运放设计为线性区闭环工作。</li><li><b>速度:</b>比较器摆率快、传播延迟小(ns~百 ns 级,如 LM393/LM311);普通运放饱和后要从饱和区"爬出来",当比较器用很慢。</li><li><b>输出结构:</b>很多比较器是集电极开路(OC),需上拉电阻,电平灵活;运放推挽输出。</li><li>误用代价:运放当比较器→响应慢+可能相位补偿不适;比较器当运放→开环增益低且不稳定,不可闭环。</li></ul><p><b>迟滞比较器:</b>引入正反馈,阈值随输出状态变化(上行阈值 V<sub>T+</sub>、下行阈值 V<sub>T−</sub>,回差 ΔV=V<sub>T+</sub>−V<sub>T−</sub>)。输入噪声在单一阈值附近时,普通比较器输出抖动(毛刺串);迟滞让"翻转一次后阈值立刻让开",<b>以空间换稳定</b>。应用:过流保护触发、按键去抖、PWM 发生器(迟滞+RC=张弛振荡)。回差设计:略大于预期噪声峰峰值。</p>',
  follow:['迟滞比较器回差怎么设计(相对噪声幅度)?','为什么比较器输出常做成集电极开路?'] },

{ id:'hw-05', s:'hw', lv:5, tags:['LDO','DCDC'],
  q:'LDO 与 DCDC(Buck/Boost)的原理与选型?',
  a:'<div class="table-wrap"><table><tr><th></th><th>LDO(线性)</th><th>DCDC(开关)</th></tr><tr><td>原理</td><td>调整管工作在线性区,当"可变电阻"分压</td><td>MOS 高频开关+电感储能,占空比调压</td></tr><tr><td>效率</td><td>η≈V<sub>out</sub>/V<sub>in</sub>(5V→3.3V 仅 66%)</td><td>85~97%</td></tr><tr><td>纹波/噪声</td><td><b>极低(μV 级),无 EMI</b></td><td>数十 mV 纹波+开关噪声,需滤波与布局功夫</td></tr><tr><td>成本/面积</td><td>低、简单</td><td>高(电感+续流管+补偿)</td></tr><tr><td>发热</td><td>(V<sub>in</sub>−V<sub>out</sub>)·I 全变热</td><td>小</td></tr><tr><td>选型</td><td>压差小、电流小、给 ADC/射频等敏感负载供电</td><td>大压差、大电流、电池续航敏感</td></tr></table></div><p><b>系统级答案(加分):</b>混合架构——DCDC 先高效降压(如 24V→5V),LDO 二级"净噪"(5V→3.3V 供 VDDA/晶振/射频),兼顾效率与纯净。关键参数:LDO 看压差(Dropout)、PSRR、静态电流;DCDC 看拓扑、开关频率(高→电感小但开关损耗/EMI 大)、轻载效率。</p>',
  follow:['LDO 的 PSRR 为什么对 ADC 供电重要?','Buck 的续流二极管换同步整流为什么效率更高?'],
  links:[{t:'电源管理功率链路分析',u:'../03_项目实操/11_电源管理功率链路分析/'}] },

{ id:'hw-06', s:'hw', lv:4, tags:['TVS','ESD','退耦'],
  q:'TVS、ESD 管、压敏电阻的区别?退耦电容为什么必须贴近芯片?',
  a:'<p><b>防护器件三兄弟:</b></p><ul><li><b>TVS(瞬态抑制二极管):</b>雪崩击穿钳位,响应 ps~ns 级,功率大(600W~15kW),防浪涌(Lightning/Surge,如 24V 电源口、CAN 总线)。双向/单向、反向击穿电压与钳位电压是关键参数。</li><li><b>ESD 管:</b>小功率 TVS 的别支,响应极快、结电容低(0.1~5pF),保护高速接口(USB/HDMI/编码器线);结电容大会伤信号沿。</li><li><b>压敏电阻(MOV,氧化锌):</b>钳位电压高、响应慢(μs 级)、老化(漏电流增大),用于交流电源粗保护;常与 TVS 分级配合(MOV 粗泄+TVS 精钳+电阻限流)。</li></ul><p><b>退耦(去耦)电容:</b>芯片瞬态电流(di/dt)先由就近电容供给,避免走线电感造成电压跌落与地弹;距离每增加 1cm,寄生电感显著抬高频阻抗——<b>"电容不是放在电路上,是放在电流回路上"</b>。典型组合:10μF( Bulk,每区域)+100nF(每电源脚,≤1cm 距离);高速设计还看阻抗-频率曲线与反谐振峰。</p>',
  follow:['TVS 的钳位电压和击穿电压什么关系?','退耦电容为什么要大小并联(不同谐振点)?'],
  links:[{t:'硬件避坑指南',u:'../02_硬件基础/04_硬件设计通用要点_避坑指南.html'}] },

{ id:'hw-07', s:'hw', lv:4, tags:['MOS驱动','自举'],
  q:'为什么 MCU 不能直接驱动功率 MOS?栅极驱动器(自举)怎么工作?',
  a:'<p><b>直驱不行:</b>①MCU 输出 3.3V/几 mA,而功率 MOS 需 V<sub>GS</sub>≈10V 才完全导通、栅极电荷 Q<sub>g</sub> 数十 nC 需安培级瞬时电流才能快速开关;②驱动不足→MOS 工作在半导通区,损耗暴涨烧管。</p><p><b>栅极驱动器:</b>电平搬移+图腾柱强驱动(源/灌 1~4A),并集成死区、欠压锁定、过流故障脚。半桥上桥的难点:上管导通后源极被抬到母线电压,栅极需更高电位→<b>自举电路</b>:自举二极管+自举电容;下管导通期间,母线经二极管给自举电容充电(充到 VCC);上管开通时,电容提供"浮动电源"驱动上管栅极。约束:占空比不能长期 100%(无充电窗口),需周期性刷新;耐压与漏电流决定最大高电平时间。</p>',
  follow:['自举电容怎么取值(相对 Qg 与开关频率)?','为什么高边驱动还常用集成半桥驱动芯片而不是分立?'],
  links:[{t:'FOC 驱动器硬件深挖 · 栅驱',u:'../02_硬件基础/09_FOC驱动器硬件深挖.html'}] },

{ id:'hw-08', s:'hw', lv:4, tags:['上下拉','OCOD'],
  q:'上拉/下拉电阻的作用?什么是开漏(OC/OD)输出,怎么用?',
  a:'<p><b>上下拉:</b>给悬空输入一个确定电平(CMOS 悬空=天线,易受扰、双管导通直通功耗);确定总线空闲态(I2C 上拉到高=空闲);推挽输出冲突时开漏+上拉实现"线与"。取值权衡:阻值小→边沿快、抗扰强,但功耗大、输出低电平抬升(OD 灌电流限制);典型 4.7k~10k(I2C)、100k 级(高阻上拉省电)。</p><p><b>开漏(OD)/集电极开路(OC):</b>输出级只有下管,只能"拉低"与"释放",高电平靠外部上拉。<b>三大用途:</b>①电平转换(上拉到任意电压,如 3.3V↔5V);②多设备线与共享线(I2C/INT 共享,任一拉低即低);③line-OR 电源好(如 PG 信号)。速度受限:上升沿靠 RC(上拉电阻×线缆电容),I2C 快速模式 400kHz 需按负载电容算上拉。STM32 的"复用开漏+内部上拉/外部上拉"是配置高频考点。</p>',
  follow:['I2C 上拉电阻 4.7k 怎么来的(按上升时间与总线电容算)?','线与逻辑在 I2C 仲裁里怎么用?'] },

{ id:'hw-09', s:'hw', lv:4, tags:['电流采样'],
  q:'低边电流采样电路怎么设计?开尔文连接为什么重要?',
  a:'<p><b>典型链路:</b>采样电阻(mΩ 级,低温漂如 2512 封装 1W)→ RC 前滤波(截止数百 kHz,抑开关振铃)→ 差分/仪表运放放大(增益按满量程匹配 ADC)→ ADC 同步采样(PWM 中心点触发)。</p><p><b>电阻选型:</b>压降与发热折中——1mΩ@30A 仅 30mV 但信号小;常用 1~5mΩ 精密电阻,四线制 Kelvin 焊盘。<b>开尔文连接:</b>主回路几十安培流过焊盘与铜箔产生毫伏级铜损压降,若采样线与功率线共用焊盘,这些压降会被当成"电流信号"叠加误差;Kelvin 从电阻焊盘<b>内侧</b>单独引两根细线到运放输入,只测电阻本体压降,消除铜箔与焊点误差。</p><p>低边采样优点:共模接近地、运放便宜;缺点:负载不接地(地弹)。高边采样共模=母线电压,需高共模差放(如 INA240)。FOC 三电阻下桥采样即三路低边采样+PWM 同步时序。</p>',
  follow:['采样电阻的温漂为什么会引入误差(自热)?','高边采样为什么要选高共模差分放大器?'],
  links:[{t:'FOC 驱动器硬件深挖',u:'../02_硬件基础/09_FOC驱动器硬件深挖.html'}] },

{ id:'hw-10', s:'hw', lv:3, tags:['电机驱动拓扑'],
  q:'三相逆变桥的直通(击穿)是什么?怎么防?',
  a:'<p><b>直通(shoot-through):</b>同一半桥上下两管同时导通,母线经两管短路,电流数百安级瞬间损毁 MOS/IGBT。诱因:①开关时序重叠(无死区/死区不足);②栅极驱动信号受扰(Miller 效应 dv/dt 经 Cgd 耦合抬升关断管栅极);③驱动电源异常或上下管驱动逻辑竞争。</p><p><b>防护体系(分层):</b></p><ul><li><b>死区时间:</b>硬件互锁(驱动芯片内置)或 PWM 外设死区发生器,典型 200ns~2μs,按管子开关时间+裕量取;</li><li><b>米勒钳位:</b>驱动器 Miller clamp 引脚把关断管栅极钳到地,对抗 dv/dout/dt 耦合;</li><li><b>负压关断/低阻关断:</b>IGBT 常用 −5~−8V 关断,防 dV/dt 误导通;</li><li><b>过流硬件保护:</b>比较器+母线电流硬件阈值直接封波(nFAULT),不等软件;母线保险/NTC 过温;</li><li><b>布局:</b>功率环路最小化、驱动回路短且地分离,降低耦合源头。</li></ul>',
  follow:['米勒效应导致的误导通机理详细说一下?','死区时间设大了小了各有什么问题?'],
  links:[{t:'FOC 驱动器硬件深挖',u:'../02_硬件基础/09_FOC驱动器硬件深挖.html'}] },

/* ================= 无人机电调 esc ================= */
{ id:'esc-01', s:'esc', lv:5, tags:['电调组成'],
  q:'无人机电子调速器(ESC)的组成部分与核心功能是什么?',
  a:'<p><b>功能:</b>把飞控的油门指令(如 DShot 码值)翻译成三相逆变桥的换相/调制序列,控制无刷电机转速,并提供电流限制、制动、遥测(电流/电压/温度)乃至给飞控供电(BEC)。</p><p><b>组成五块:</b></p><ul><li><b>输入解码:</b>PWM/OneShot/Multishot/DShot 解析(后者数字编码带 CRC);</li><li><b>控制核心:</b>MCU 运行换相算法(方波六步或 FOC),现代数字电调(如 BLHeli_32/AM32)还做 PID 转速闭环、启动管理;</li><li><b>三相逆变桥:</b>6 个 MOS(或智能半桥)+栅驱,母线大电容;</li><li><b>传感:</b>反电动势过零检测(无感)/霍尔(有感),母线电流与温度采样;</li><li><b>BEC:</b>5V/5V 输出给飞控与接收机(线性或开关),大桨机常独立供电。</li></ul><p>一句话定位:电调=单电机版的简易 FOC 驱动器,只是传统航模电调用"方波+过零换相"这一更简单粗暴的算法。</p>',
  follow:['BLHeli_32 与 AM32 固件有什么区别?','为什么电调要支持遥测回传?'],
  links:[{t:'FOC 驱动器硬件深挖',u:'../02_硬件基础/09_FOC驱动器硬件深挖.html'}] },

{ id:'esc-02', s:'esc', lv:5, tags:['六步','方波FOC'],
  q:'电调的方波(六步换相)与 FOC 有什么区别?',
  a:'<div class="table-wrap"><table><tr><th></th><th>方波六步(传统航模电调)</th><th>FOC(矢量控制)</th></tr><tr><td>绕组励磁</td><td>同一时刻只有两相通电(第三相测反电动势),六种离散状态循环</td><td>三相正弦合成旋转矢量,连续</td></tr><tr><td>位置信息</td><td>反电动势过零点(无感)</td><td>编码器/观测器(连续电角度)</td></tr><tr><td>转矩特性</td><td>波动大(方波谐波),噪声"滴滴"声</td><td>平滑,噪声低</td></tr><tr><td>效率</td><td>中(高速尚可)</td><td>高,低速大扭矩也高</td></tr><tr><td>低速性能</td><td><b>差</b>:反电动势太小,过零点不可测</td><td>好:可静态出力</td></tr><tr><td>算力需求</td><td>极低(比较器+简单逻辑)</td><td>高(Clarke/Park+PI+SVPWM)</td></tr><tr><td>典型场景</td><td>穿越机(高转速,响要快)</td><td>云台、机架大桨、人形关节</td></tr></table></div><p><b>本质:</b>六步是"离散粗调"(每 60°电角换一档),FOC 是"连续细调"(每个 PWM 周期重算矢量)。现代大疆类整机与高性能云台、机器人关节全用 FOC;穿越机生态因响应速度与生态惯性仍以方波数字电调为主,但 FOC 电调(如 VESC 系)正在渗透。</p>',
  follow:['六步换相的第三相在干什么(测反电动势过零)?','为什么方波电调低速性能差?'],
  links:[{t:'核心原理动画 · FOC',u:'../01_理论入门/02_核心原理动画演示_FOC_三环_减速器.html'}] },

{ id:'esc-03', s:'esc', lv:4, tags:['DShot'],
  q:'DShot 与传统 PWM 油门信号的区别?有哪些速率档?',
  a:'<p><b>传统 PWM:</b>油门=脉宽 1000~2000μs,50~490Hz(OneShot125=125μs 窗口、Multishot 更短)。模拟量,分辨率受抖动影响,需先校准行程(记录 min/max 脉宽),易受电源噪声干扰。</p><p><b>DShot:</b>数字编码,一帧 16bit:11bit 油门值(48~2047)+3bit 遥测请求+4bit CRC。高低电平用<b>脉宽比例</b>表达(0="37.5%高"、1="75%高"占整个 bit 时长),容忍时钟误差。速率档:DShot150/300/600/1200(数字=kbps)——DShot600 一帧仅 26.7μs,飞控到电调延迟亚百微秒级,适配高更新率控制回路(Betaflight 8k/8k)。</p><p><b>优势:</b>无需校准(数值即油门)、抗噪(CRC 校验)、方向设置数字化、可开遥测(GSTAT/电流回传)。电调固件(BLHeli_S/32、AM32)普遍支持。答出"数字协议消除模拟校准与漂移"即抓住本质。</p>',
  follow:['DShot 为什么用脉宽比例而不是电平判 0/1?','双向 DShot(Bidirectional DShot)做什么用?'] },

{ id:'esc-04', s:'esc', lv:4, tags:['启动','失步'],
  q:'无感电调怎么启动电机?什么是失步,怎么防?',
  a:'<p><b>启动三段式(强拖→换切):</b>①<b>预定位:</b>给固定两相通电,把转子拉到已知位置;②<b>强拖(开环加速):</b>按预设斜坡频率依次换相,电机同步"跟着走"(此时反电动势太弱,不能闭环);③<b>切换闭环:</b>转速升到反电动势过零检测可靠后,切到过零换相/观测器闭环。切换点与斜坡参数是固件调参难点(大桨重载机更难,叫"起步抖/起步失败")。</p><p><b>失步:</b>负载突变/加速度过大时,转子跟不上定子磁场,等效"磁场拉着转子空转"——电流猛增、转矩消失、电机异响。诱因:加速度超限、换相延迟过大、电压不足。<b>防护:</b>限制油门斜率(ramp),过流封波重启,FOC 方案里用观测器连续跟踪可显著缓解(无离散换相);载人/载重机要求有感(编码器)方案根除失步。</p>',
  follow:['为什么带大桨的电机更难启动?','FOC 电调还会失步吗?什么形态?'] },

{ id:'esc-05', s:'esc', lv:3, tags:['BEC'],
  q:'电调上的 BEC 是什么?线性 BEC 与开关 BEC 怎么选?',
  a:'<p><b>BEC(Battery Elimination Circuit):</b>电调内置的降压输出(典型 5V/2~5A),给飞控/接收机/舵机供电,免去单独带一块小电池——名字由来就是"消灭了那块电池"。</p><p><b>线性 BEC:</b>7805 类线性稳压,简单干净无纹波;但效率=V<sub>out</sub>/V<sub>in</sub>,4S(14.8V)转 5V 效率仅 34%,大电流时调整管烫手,一般只适合 2S~3S 小电流。</p><p><b>开关 BEC(SBEC):</b>Buck 降压,效率 85%+,发热小,支持高节数电池(4S~12S);缺点是纹波/EMI,给射频敏感设备(RX/图传)供电时留意布局与滤波。大疆类整机将电源管理独立成 PMU 模块(多路 DCDC+LDO 分级),是更彻底的工程化方案。</p><p>选型话术:小机 2~3S 且电流<1A 用线性;4S 以上或电流大,必须开关;给 ADC/RF 的 5V 再加 LDO 二级净噪。</p>',
  follow:['为什么给接收机的 5V 常再串磁珠+电容?','飞控供电冗余(双BEC二极管或)怎么做?'] },

{ id:'esc-06', s:'esc', lv:4, tags:['动力配型'],
  q:'四旋翼动力系统(电机+桨+电调+电池)怎么配型?',
  a:'<p><b>配型四步:</b></p><ul><li><b>①拉力需求:</b>总推重比 ≥2:1(竞速机 5:1+,负载机 2~2.5);单电机最大拉力=总重×推重比/4;</li><li><b>②电机+桨:</b>查电机静态拉力表,选"目标拉力下效率最高(g/W)"的桨配组合(大桨低KV效率高,小桨高KV暴力);注意桨的拉力=电流主决定因素;</li><li><b>③电调:</b>持续电流 ≥ 该组合最大电流×1.3 裕量(留堵转/机动峰值);电调规格标注(如 35A)通常指持续,峰值另看;</li><li><b>④电池:</b>放电倍率 C×容量 ≥ 4 机总最大电流(压降要小);电压=电机/电调标称(S数×3.7V)。</li></ul><p><b>系统校核(加分):</b>悬停点应落在电机效率峰附近(悬停油门 40~50%);校核电池连接器(XT60/XT90)与线径载流;整机电流预算=4×单机峰值+余量,决定电池容量→续航(续航≈容量×80%/(悬停总电流))。</p>',
  follow:['为什么悬停油门最好在 40~50%?','大桨低KV和小桨高KV效率差异的物理原因?'] },

{ id:'esc-07', s:'esc', lv:3, tags:['刹车','能量回馈'],
  q:'电调的"刹车"是怎么回事?能量去哪了?',
  a:'<p><b>有源刹车(active brake):</b>油门骤降时,电调让 MOS 主动短路三相(下桥全开)或反接相序,产生反向转矩让电机快速减速——穿越机做翻滚动作需要"说停就停"。</p><p><b>能量去向:</b>电机减速时变发电机,动能转化为电能:①短路刹车→能量泄放在绕组电阻(发热);②回馈刹车→能量泵回电池,但锂电池不吸收大电流回充(BMS 保护/鼓包风险),通常配合<b>泄放电阻</b>或限制回馈电流;③部分智能电调做"再生制动"回充小电流。人形机器人关节下坡/落腿时的能量回收是同一物理问题,研究热点是超级电容缓冲。</p>',
  follow:['锂电池为什么不建议大电流回充?','关节机器人的能量回收常用什么缓冲?'] },

{ id:'esc-08', s:'esc', lv:3, tags:['安全','失效'],
  q:'电调层面的安全设计有哪些?(失效保护)',
  a:'<ul><li><b>信号失效:</b>失去油门信号→可配置失效保护(自动怠速/停转),DShot CRC 连续错误计数触发;</li><li><b>过流:</b>逐相/母线过流硬件比较器封波;堵转时间限制;</li><li><b>过温:</b>MOS/驱动板 NTC,分级降功率(先降后停);</li><li><b>欠压:</b>电池低电压分级告警/降落,防单节过放;</li><li><b>上电安全:</b>油门摇杆非最低不上电(经典保护);启动自检(校准/参数CRC);</li><li><b>系统级:</b>飞控心跳(RX_FAILSAFE)+电调看门狗,双重保险;重要机型双电调冗余。</li></ul><p>答题框架:"信号层失效保护→电气层过流过温→能量层欠压→系统层心跳冗余",层层递进显示工程思维。</p>',
  follow:['为什么上电时要求油门在最低位?','电调参数损坏(断电刷固件中)怎么防?'] },

/* ================= ROS ros ================= */
{ id:'ros-01', s:'ros', lv:5, tags:['通信模型'],
  q:'ROS 的话题、服务、动作三种通信机制分别适合什么场景?',
  a:'<div class="table-wrap"><table><tr><th></th><th>话题 Topic</th><th>服务 Service</th><th>动作 Action</th></tr><tr><td>模型</td><td>发布/订阅(异步,单向流)</td><td>请求/应答(同步,一问一答)</td><td>目标/反馈/结果(异步长任务)</td></tr><tr><td>典型带宽</td><td>高频连续流</td><td>低频调用</td><td>持续数秒~分钟</td></tr><tr><td>支持</td><td>一对多、多对一</td><td>一对一(ROS2 可服务端多)</td><td>可取消、可抢占</td></tr><tr><td>例子</td><td>/cmd_vel、/scan、/imu</td><td>spawn、clear_costmap、设置模式</td><td>navigate_to_pose、move_base</td></tr></table></div><p><b>答题要点:</b>传感器流和控制流用 Topic(解耦、低延迟);偶发的"问一下/设置一下"用 Service;导航/抓取这类"启动-监控-完成/取消"用 Action。ROS2 中三者皆基于 DDS,Action 实现为"服务(目标/结果/取消)+话题(feedback/status)"组合。</p>',
  follow:['为什么 cmd_vel 不用服务(同步)而用话题?','Action 为什么必须支持取消?'] ,
  links:[{t:'软件学习路线图 · ROS2',u:'../06_软件与算法/01_软件学习路线图.html'}]},

{ id:'ros-02', s:'ros', lv:5, tags:['TF'],
  q:'ROS 的 TF(坐标变换)系统是什么?查一个变换的正确姿势?',
  a:'<p><b>TF 树:</b>每个坐标系是节点,边=父到子的刚体变换,整棵树连通无环;节点广播动态变换(如 odom→base_link)或静态变换(map→odom、base→laser)。TF 维护带时间戳的变换缓冲区(默认10s),支持"在任意时刻查询任意两系间的变换"——机器人上数十个系(laser/imu/camera/gripper)全靠它统一。</p><p><b>查询:</b>lookupTransform(目标系, 源系, 时间)。两个坑(必答):①<b>时间同步</b>:查"最近可用"用 tf2 的 time=0(最新)或留出等待(transform latency),否则 Extrapolation Exception;②<b>树必须连通</b>:同一时刻每个系只有一个父,广播重复父子会报"multiple parents"。</p><p><b>经典链路:</b>map →(AMCL 修正)→ odom →(里程计)→ base_link →(固定安装)→ laser。odom 抖动小但漂移,map 准但跳变,两者分离是导航定位的经典设计。</p>',
  follow:['为什么 map→odom 的变换由 AMCL 发布而不是反过来?','tf2 的 time=0 是什么语义?'] },

{ id:'ros-03', s:'ros', lv:5, tags:['编队控制'],
  q:'Leader-Follower 编队跟随的控制原理?l-ψ 与 l-α 编队是什么?',
  a:'<p><b>思想:</b>队形以 leader 为锚,follower 维持与 leader 的<b>期望相对几何关系</b>(距离+方向),而不是各自独立走全局路径——leader 机动,follower 控制律自然保持队形。</p><ul><li><b>l-ψ(距离+方位角):</b>follower 维持期望距离 l 与相对 leader 航向的方位角 ψ——距离+方位两个极坐标量,一个距离误差+一个角度误差,分别映射到 follower 线速度/角速度控制。结构简单;缺点:不直接限制 follower 朝向(可能"横着蹭")。</li><li><b>l-α(距离+两条方位角):</b>约束 l、leader 方位 ψ<sub>L</sub> 与 follower 自身航向 α,可同时锁定相对位置与相对航向(队形更"刚"),代价是控制律复杂些。</li></ul><p><b>实现链路(仿真项目标准答案):</b>编队控制器节点订阅 leader 的 odom,按期望几何算出 follower 的目标点→发 follower 的 /cmd_vel(或 move_base 目标);Gazebo 多机模型+namespace 隔离;队形变换=在线改期望 (l,ψ) 参数。常追问稳定性:l-ψ 可化为级联误差动力学,用 Lyapunov 证明误差收敛。</p>',
  svg:'<svg viewBox="0 0 560 200" role="img" aria-label="leader-follower 编队几何"><defs><marker id="ar3" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="currentColor"/></marker></defs><path d="M60,170 C120,60 220,40 300,60" fill="none" stroke="#6b7280" stroke-width="1.2" stroke-dasharray="5 4"/><text x="90" y="90" font-size="10" fill="#9aa4b2">leader 轨迹</text><rect x="292" y="46" width="26" height="16" rx="3" fill="rgba(59,130,246,.25)" stroke="#58a6ff"/><line x1="318" y1="54" x2="352" y2="54" stroke="#58a6ff" stroke-width="1.6" marker-end="url(#ar3)"/><text x="330" y="44" font-size="10" fill="#58a6ff">航向θ_L</text><text x="296" y="80" font-size="11" fill="#58a6ff">Leader</text><path d="M258,120 C240,104 246,92 262,92 C276,92 280,104 268,120" fill="none" stroke="#22c55e" stroke-width="0"/><circle cx="240" cy="128" r="9" fill="rgba(34,197,94,.2)" stroke="#22c55e"/><line x1="244" y1="124" x2="270" y2="104" stroke="#f59e0b" stroke-width="2"/><text x="250" y="112" font-size="11" fill="#f59e0b">l(期望距离)</text><path d="M262,112 A16 16 0 0 1 276,102" fill="none" stroke="#ef4444" stroke-width="1.6"/><text x="262" y="98" font-size="11" fill="#ef4444">ψ(方位角)</text><text x="212" y="150" font-size="11" fill="#22c55e">Follower</text><circle cx="180" cy="158" r="9" fill="rgba(34,197,94,.2)" stroke="#22c55e"/><text x="152" y="182" font-size="11" fill="#22c55e">Follower2</text><text x="360" y="120" font-size="11" fill="currentColor">误差: Δl→线速度, Δψ→角速度</text><text x="360" y="140" font-size="11" fill="currentColor">多follower=(l,ψ)参数表=队形库</text><text x="360" y="160" font-size="11" fill="currentColor">队形切换=改参数,轨迹无需重规划</text></svg>',
  follow:['队形中 follower 避障怎么加入(人工势场/避障层)?','l-ψ 编队的稳态误差在 leader 转弯时为什么变大?'] ,
  links:[{t:'仿真中心',u:'../08_学习工具/08_仿真中心.html'}]},

{ id:'ros-04', s:'ros', lv:4, tags:['多机仿真'],
  q:'Gazebo/ROS 里怎么做多机器人仿真?命名空间怎么用?',
  a:'<p><b>核心=命名空间隔离:</b>每个机器人一套独立前缀(如 robot1/、robot2/),所有节点、话题、TF 帧、参数都在各自空间下:/robot1/cmd_vel、/robot1/scan;TF 帧 robot1/odom、robot1/base_link。工具:xacro 的 args 传 namespace 生成差异化 URDF;launch 文件用 group+ns 批量包装;Gazebo 里 spawn 多份模型(name 不同)。</p><p><b>易踩坑:</b>①TF 帧名没加前缀→两台车的 base_link 冲突,整树崩;②共享一个 map 系时 map→各 odom 单独发;③同一 SLAM/AMCL 实例只能服务一车,每车一个(或全局定位节点);④Gazebo 物理引擎默认单线程,多机+接触多会慢,可分区(world 分块)。</p><p><b>项目话术:</b>"xacro 参数化 URDF+launch 循环 group ns 一键拉起 N 机,编队控制节点按 robot_id 订阅 leader 位姿发布 follower 速度",一句话覆盖标准架构。</p>',
  follow:['两台机器人的 AMCL 怎么共存?','Gazebo 多机仿真很卡,你怎么优化?'] },

{ id:'ros-05', s:'ros', lv:4, tags:['Nav2'],
  q:'ROS2 Nav2 导航栈的组成与工作流程?',
  a:'<p><b>四大服务器:</b>①Planner(全局规划,A*/Theta*/Smac,走全局代价地图);②Controller(局部跟踪控制,DWB/TEB/MPPI,走局部代价地图);③Recovery(清理代价地图/后退/旋转等恢复行为);④BT Navigator(行为树编排整流程)。加 Lifecycle 管理节点启停。</p><p><b>定位:</b>AMCL(自适应蒙特卡洛,粒子滤波)在已知栅格地图上融合激光+里程计估计位姿;地图由 SLAM Toolbox(在线建图)产出。</p><p><b>代价地图四层(常考):</b>静态地图层+障碍层(激光/超声实时)+膨胀层(障碍外扩代价梯度,膨胀半径=安全距离)+自定义层(如禁区)。</p><p><b>流程:</b>RViz 下发目标→BT 启动→AMCL 供位姿→Planner 全局路径→Controller 局部跟踪下发 cmd_vel→撞死则 Recovery→到达。对比 ROS1 move_base:Nav2 模块化为独立服务器+行为树,可组合、可实时替换控制器。</p>',
  follow:['膨胀半径怎么定(相对机器人半径+安全裕度)?','AMCL 粒子数与重采样策略的影响?'] ,
  links:[{t:'软件学习路线图',u:'../06_软件与算法/01_软件学习路线图.html'}]},

{ id:'ros-06', s:'ros', lv:4, tags:['DDS','ROS1vs2'],
  q:'ROS2 相比 ROS1 的关键改进?DDS 带来了什么?',
  a:'<div class="table-wrap"><table><tr><th></th><th>ROS1</th><th>ROS2</th></tr><tr><td>通信</td><td>自研 TCPROS/UDPROS,依赖 roscore(master)</td><td>DDS(数据分发服务),<b>去中心化自动发现</b></td></tr><tr><td>实时性</td><td>无保障</td><td>可配 QoS+内存预分配,可做硬实时节点</td></tr><tr><td>QoS</td><td>基本无</td><td>可靠性/历史深度/期限(deadline)/寿命等</td></tr><tr><td>多机</td><td>麻烦(URI/时间同步)</td><td>同一 DDS 域即互通,天然分布式</td></tr><tr><td>生命周期</td><td>无标准</td><td>Lifecycle 节点标准化的状态机管理</td></tr><tr><td>平台</td><td>Linux 为主</td><td>Linux/Win/mac/RTOS(嵌入式 micro-ROS)</td></tr></table></div><p><b>DDS 带来:</b>发布订阅自动发现(无 master 单点)、传输层可插拔(UDP 组播/共享内存 Iceoryx)、QoS 协商(传感器 best-effort vs 控制 reliable)。代价:默认组播在某些 WiFi/容器环境发现失败(常见坑:ROS_DOMAIN_ID 隔离、RMW 实现切换 FastDDS/CycloneDDS)。</p>',
  follow:['QoS 的 best_effort 与 reliable 各适合什么话题?','ROS_DOMAIN_ID 的作用?'] },

{ id:'ros-07', s:'ros', lv:4, tags:['URDF','仿真'],
  q:'URDF 描述机器人的什么信息?Gazebo 仿真一个机器人还需要什么?',
  a:'<p><b>URDF 内容三块:</b>①link(刚体:可视化几何/碰撞几何/惯量 inertial);②joint(连接:类型 fixed/revolute/continuous/prismatic,轴 axis、限位 limit、原点 origin);③材料/外观。URDF 必须是<b>树结构</b>(单根,无闭环——闭环机构要 SRDF/constraint 处理)。</p><p><b>Gazebo 还需要:</b>①每个 link 的 inertial(仿真必须,缺了会被忽略或抖飞);②gazebo 标签:摩擦、阻尼、PID(joint control)、传感器插件(激光/IMU/相机)、ros_gz 桥接;③transmission 与控制器(ros2_control 框架:hardware interface+controller manager)。</p><p><b>工作流(项目话术):</b>"SolidWorks/xacro 建模→URDF+xacro 参数化→Gazebo 插件配传感器→ros2_control 接控制器→RViz 调试 TF 与规划",再提一句 xacro 宏复用与 inertia 检查(总质量合理)。</p>',
  follow:['为什么 URDF 不支持闭环机构?怎么变通?','惯量参数错误在仿真里什么现象?'] },

{ id:'ros-08', s:'ros', lv:3, tags:['SLAM'],
  q:'简述激光 SLAM 的基本原理(以 Cartographer/SLAM Toolbox 为例)。',
  a:'<p><b>前端-后端框架:</b></p><ul><li><b>前端(里程计+匹配):</b>帧间匹配(scan-to-scan 或 scan-to-map,用相关性匹配/高斯牛顿优化),加上 IMU/轮式里程计预测,得到短时一致的位姿增量——不积累不行,只靠它也不行(漂移);</li><li><b>回环检测:</b>识别"回到走过的地方"(分支定界搜索候选匹配/特征指纹),建立新约束;</li><li><b>后端(图优化):</b>位姿图优化(Pose Graph),节点=关键帧位姿,边=约束(相邻+回环),回环边的强约束"拉直"历史漂移,g2o/Ceres 求解;子图(submap)概念用于海量激光管理;</li><li><b>建图:</b>优化后轨迹+激光投影出栅格占据地图(对数几率更新)。</li></ul><p>加回答疑:与视觉 SLAM(ORB-SLAM,特征点/直接法)对应关系一致(前端-回环-后端);2D 栅格 vs 3D 点云(LOAM 系)。</p>',
  follow:['回环检测为什么重要(不加会怎样)?','占据栅格的概率更新怎么做的?'] },

{ id:'ros-09', s:'ros', lv:3, tags:['工程组织'],
  q:'一个 ROS 多机编队跟随仿真项目,你如何组织工程结构?',
  a:'<p><b>标准答案(体现工程素养):</b></p><ul><li><b>工作空间:</b>colcon 工作空间,包按功能拆:robot_description(xacro URDF)、robot_bringup(launch 集合)、formation_controller(编队算法)、formation_sim(gazebo world+多机 spawn)、formation_msgs(自定义消息 FormationConfig);</li><li><b>launch 分层:</b>gazebo.launch→robots.launch(xacro 循环 ns spawn N 机)→formation.launch(编队节点+RViz);一键 make launch;</li><li><b>参数化:</b>队形参数(每机 l,ψ,v_max)放 YAML/ROS param,运行时服务切换队形;</li><li><b>质量:</b>单元测试(编队几何计算 cpp test)、CI 构建、README 复现三步(clone→colcon build→ros2 launch)。</li></ul><p>复试价值点:能画出节点图(rqt_graph 口头版):leader odom→formation_controller(定时器)→N×cmd_vel,以及话题/TF 命名规范。被问"难点"标准素材:多机 TF 命名空间、Gazebo 性能、转弯时队形稳态误差。</p>',
  follow:['自定义消息为什么要单独成包?','编队节点内部用 ROS timer 还是订阅触发?为什么?'] },

/* ================= C 语言 c ================= */
{ id:'c-01', s:'c', lv:5, tags:['指针','数组'],
  q:'指针和数组是什么关系?"数组名"什么时候不等于指针?',
  a:'<p><b>常规关系:</b>表达式里数组名<b>退化为指向首元素的指针</b>:a[i] ≡ *(a+i),传参 `int a[]` 等价 `int *a`(函数内 sizeof 得到指针大小 4/8)。数组是"一块连续内存+编译期长度",指针是"一个地址变量",<b>本质不同</b>。</p><p><b>三个不退化例外(高频考点):</b></p><ul><li><b>sizeof(arr):</b>得到整个数组字节数,不是指针大小;</li><li><b>&arr:</b>得到"指向整个数组的指针"(int(*)[N]),数值同首地址但类型不同,+1 跳整个数组;</li><li><b>字符串字面量初始化数组</b> char s[]="abc"(可修改副本) vs char *p="abc"(只读常量区,改它段错误)。</li></ul><p><b>指针数组 vs 数组指针:</b>int *p[10](10 个指针) vs int (*p)[10](指向数组的指针)——看运算符优先级,[] 优先于 *。答题时给"右左法则"读法,加分。</p>',
  code:'int a[5] = {1,2,3,4,5};\nint (*p)[5] = &a;        /* 指向整个数组 */\nprintf("%zu %zu\\n", sizeof(a), sizeof(&a)); /* 20 8(64位) */\nprintf("%d %d\\n", *a, (*p)[2]);             /* 1 3 */',
  follow:['char s[]="abc" 与 char *p="abc" 修改时的区别?','二维数组传参为什么必须给列数?'] },

{ id:'c-02', s:'c', lv:5, tags:['内存布局'],
  q:'C 程序的内存是怎么分区的?各放什么?',
  a:'<p><b>四(五)区模型(以嵌入式视角):</b></p><ul><li><b>栈(stack):</b>局部变量、函数参数、返回地址,自动管理、向下生长、快但小(嵌入式默认几 KB~);溢出=Stack Overflow(递归/大数组)。</li><li><b>堆(heap):</b>malloc/free 手工管理,向上生长,碎片化风险,泄漏=只 malloc 不 free,悬垂=free 后再用。</li><li><b>全局/静态区:</b>已初始化 .data、未初始化 .bss(占文件不占初值);static 局部变量也在此——函数返回后仍在。</li><li><b>常量/代码区(.text/.rodata):</b>指令与 const 常量、字符串字面量,只读,写入→段错误。</li></ul>',
  svg:'<svg viewBox="0 0 560 210" role="img" aria-label="C 程序内存四区布局"><rect x="30" y="20" width="480" height="40" rx="6" fill="rgba(239,68,68,.12)" stroke="#ef4444"/><text x="50" y="38" font-size="12" fill="#ef4444">栈区 stack ↓生长</text><text x="50" y="54" font-size="10" fill="#9aa4b2">局部变量/参数/返回地址;快、自动、小;溢出=爆栈</text><rect x="30" y="70" width="480" height="34" rx="6" fill="rgba(255,255,255,.04)" stroke="#6b7280"/><text x="50" y="86" font-size="10" fill="#9aa4b2">……空闲……堆栈相向生长,相遇=内存不足</text><rect x="30" y="112" width="480" height="34" rx="6" fill="rgba(245,158,11,.12)" stroke="#f59e0b"/><text x="50" y="128" font-size="12" fill="#f59e0b">堆区 heap ↑生长</text><text x="250" y="128" font-size="10" fill="#9aa4b2">malloc/calloc/realloc;手动管理;碎片与泄漏</text><rect x="30" y="154" width="230" height="34" rx="6" fill="rgba(59,130,246,.12)" stroke="#58a6ff"/><text x="50" y="170" font-size="12" fill="#58a6ff">.bss 未初始化全局/静态</text><text x="50" y="184" font-size="9" fill="#9aa4b2">不占可执行文件体积</text><rect x="270" y="154" width="240" height="34" rx="6" fill="rgba(59,130,246,.2)" stroke="#58a6ff"/><text x="290" y="170" font-size="12" fill="#58a6ff">.data 已初始化全局/静态</text><text x="290" y="184" font-size="9" fill="#9aa4b2">static 局部变量也在这一带,函数返回仍存活</text><rect x="30" y="196" width="480" height="10" rx="4" fill="rgba(34,197,94,.15)" stroke="#22c55e"/><text x="50" y="205" font-size="9" fill="#22c55e">.text 代码 + .rodata 常量/字符串字面量(只读,写入=段错误)</text></svg>',
  extend:'<b>栈与堆的取舍:</b>栈快、自动管理、有大小限制(嵌入式默认 1~8KB,递归/大局部数组会爆栈);堆慢、手动管理、有碎片化与泄漏风险——实时系统常禁用堆分配或只允许启动时分配一次。<br><b>static 的落区:</b>带初值的 static 进 .data,无初值的进 .bss(.bss 只占符号表不占可执行映像,是嵌入式省 Flash 的关键)。<br><b>经典追问:</b>「字符串常量放哪?」→ .rodata,写它会段错误;「函数返回局部数组为什么错?」→ 栈帧已销毁,返回的是悬垂指针;「大数组该放哪?」→ 全局/static 或堆,别放栈。',
  follow:['为什么 .bss 不占文件体积?','大数组为什么应放全局/static 或堆而不是栈?','栈默认多大,怎么改(STM32 启动文件/链接脚本)?'] },

{ id:'c-03', s:'c', lv:5, tags:['volatile'],
  q:'volatile 关键字的作用?哪些场景必须用?它保证原子性吗?',
  a:'<p><b>作用:</b>告诉编译器"这个变量随时可能被程序控制流之外的因素改变",禁止对其读取/存储做优化(缓存到寄存器、合并读写、乱序删除),每次访问都真实读写内存。</p><p><b>三大必用场景:</b></p><ul><li><b>外设寄存器(MMIO):</b>status = *(volatile uint32_t*)0x40020000;不加可能被优化成读一次循环判空,死等;</li><li><b>ISR 与主程序共享变量:</b>不加,主循环里 while(flag==0) 可能被优化成只读一次寄存器版本;</li><li><b>多线程共享变量:</b>禁止编译器优化(但 volatile 不提供内存屏障/原子性)。</li></ul><p><b>经典追问——volatile 保证原子性吗?<b>不保证!</b>它只管"每次都真读内存",不管读-改-写的完整性。i++(读改写三步)在 ISR 与主程序间仍会丢更新,必须:关中断、或用原子操作(CMSIS __atomic)/硬件同步原语。另一个追问:const volatile 组合=只读状态寄存器(软件不能写,硬件会改)。</p>',
  follow:['const volatile 能同时用吗?什么含义?','volatile struct 修饰的是整个结构体还是成员?'],
  links:[{t:'软件学习路线图 · 固件',u:'../06_软件与算法/01_软件学习路线图.html'}] },

{ id:'c-04', s:'c', lv:5, tags:['static','const','作用域'],
  q:'static 和 const 分别有哪些用法?指针的 const 怎么读?',
  a:'<p><b>static 两种语境:</b>①修饰局部变量→存储期变为整个程序运行期(放 .data/.bss,函数返回仍保留值),作用域不变;②修饰全局变量/函数→限制链接属性为"本文件可见"(内部链接),防止跨文件命名污染(模块封装)。</p><p><b>const 三层:</b>①修饰普通变量→只读(改=编译错);②修饰指针→看 const 在 * 左(指向物只读)还是右(指针本身只读):口诀"<b>const 在 * 左,物不动;在 * 右,针不动</b>";③修饰函数参数→告知调用者"我不会改你的数据"(字符串库函数惯例 const char*)。</p>',
  code:'const int *p1;      /* 指向物只读:*p1 不可改,p1 可移动 */\nint const *p2;      /* 同上 */\nint * const p3;     /* 指针只读:p3 不可改,*p3 可改 */\nconst int * const p4 = &x;  /* 都只读 */\nstatic uint8_t cnt; /* 局部 static:跨调用保留值 */',
  extend:'<b>static 四种语境一次记全:</b>①局部变量→存储期=程序运行期,值跨调用保留;②全局变量/函数→内部链接,仅本文件可见(模块封装);③类内成员(C++)→所有对象共享一份,且不占对象大小;④C++ 静态成员函数→无需对象即可调用。<br><b>const 指针口诀:</b>从变量名往左读,最近的一个 const 修饰谁:「const 在 * 左→指向物只读;在 * 右→指针本身只读」;const int* 与 int const* 等价。<br><b>工程意义:</b>const 让编译器在编译期抓住「误改只读数据」的错误,并允许进 .rodata 段省 RAM——嵌入式里大数组声明为 const 就能从 RAM 挪到 Flash。',
  follow:['static 函数对链接器意味着什么?','const 数组放哪个区,为什么省 RAM?'] },

{ id:'c-05', s:'c', lv:4, tags:['结构体','对齐'],
  q:'什么是结构体对齐(填充)?为什么需要?怎么控制?',
  a:'<p><b>为什么要对齐:</b>CPU/总线按自然边界访问数据更快,有些架构(ARM Cortex-M0、DSP)非对齐访问直接 HardFault。编译器把每个成员放在其"对齐模数"(通常=自身大小)的整数倍地址,结构体总大小补齐到最大成员对齐数的整数倍。</p>',
  code:'struct A { char c; int i; short s; };   /* c(1)+填充(3)+i(4)+s(2)+尾填充(2)=12 */\nstruct B { int i; short s; char c;  };   /* i(4)+s(2)+c(1)+尾填充(1)=8 —— 大成员在前省空间 */',
  a2:'<p><b>控制手段:</b>`#pragma pack(1)` / `__attribute__((packed))` 取消填充(通信协议帧、文件格式必须紧凑);`alignas/_Alignas` 提高对齐(DMA 缓冲、缓存行)。packed 代价:非对齐访问性能下降甚至错误(给 packed 成员取指针再传给别处是坑),读写用 memcpy 最稳。加分:`offsetof` 宏核对协议布局、静态断言 sizeof 校验。</p>',
  follow:['packed 结构体成员取地址有什么风险?','DMA 缓冲区为什么有时要求对齐到 4/32 字节?'] },

{ id:'c-06', s:'c', lv:4, tags:['函数指针'],
  q:'函数指针怎么声明和使用?举两个嵌入式典型用法。',
  a:'<p><b>语法:</b>`返回类型 (*指针名)(参数表)`,如 `void (*fp)(int)`。调用 (*fp)(x) 或直接 fp(x)。 typedef 简化:`typedef void (*handler_t)(uint8_t);` 之后 handler_t 就是一个类型——回调函数表的元素类型。</p><p><b>典型用法一(回调/事件):</b>驱动注册中断/事件回调,uart_set_rx_callback(handler_t cb);上层把处理函数注入,驱动不依赖上层——解耦。</p><p><b>典型用法二(状态机/命令表):</b>用函数指针数组替代大 switch:</p>',
  code:'typedef void (*cmd_fn_t)(void);\nstatic const cmd_fn_t cmd_table[] = {\n    [CMD_START] = do_start, [CMD_STOP] = do_stop, [CMD_READ] = do_read\n};\nvoid dispatch(cmd_id_t id) { if (id < CMD_MAX) cmd_table[id](); }',
  a2:'<p>好处:加命令只加一行表项;可放 flash(const);执行 O(1)。另一个高频用法:分散加载/Bootloader 里 `void (*app_entry)(void) = (void(*)(void))APP_ADDR; app_entry();` 跳转 APP。读复杂声明用"右左法则"或 cdecl 工具。</p>',
  follow:['typedef 函数指针为什么比裸声明可读?','Bootloader 跳转前要做什么(关中断/设 MSP)?'] },

{ id:'c-07', s:'c', lv:4, tags:['宏','预处理'],
  q:'带参宏有什么陷阱?为什么多语句宏要 do{}while(0)?',
  a:'<p><b>陷阱一(纯文本替换):</b>#define SQ(x) x*x,SQ(1+2)→1+2*1+2=5 而非 9——参数与整体都要括号:#define SQ(x) ((x)*(x))。</p><p><b>陷阱二(副作用双算):</b>SQ(i++)→((i++)*(i++)) 自增两次,未定义行为。</p><p><b>陷阱三(多语句宏):</b>#define SWAP(a,b) t=a;a=b;b=t;if(cond) SWAP(x,y);else...→宏展开后 if 只挂第一句,else 悬空编译错。用 <b>do{...}while(0)</b> 包裹成单语句:</p>',
  code:'#define SWAP(a,b) do { int t_=(a); (a)=(b); (b)=t_; } while(0)\n/* if(c) SWAP(x,y); else ... 语法正确 */',
  a2:'<p>对比 inline 函数:宏无类型检查、无作用域、难调试;inline 有类型安全。预处理三板斧宏(常用且难替代):类型泛型容器、编译期断言 _Static_assert、字符串化/拼接(#x、##x,做调试打印与寄存器映射)。</p>',
  follow:['#与##运算符分别做什么?','宏的优劣对比 inline 函数?'] },

{ id:'c-08', s:'c', lv:4, tags:['malloc','堆'],
  q:'malloc 的原理?什么是内存泄漏/碎片?嵌入式为什么慎用动态内存?',
  a:'<p><b>原理:</b>libc/RTOS 堆管理器把堆视为空闲块链表;malloc 遍历找满足 size 的空闲块,分裂返回前段,剩余登记为空闲;free 把块放回链表并(好实现)合并相邻空闲块。块头记录大小/状态,故 malloc(0) 也占空间、越界写破坏下一个块头(堆损坏,崩溃点诡异)。</p><p><b>泄漏:</b>失去指针仍占内存(free 前置空/ realloc 失败保留旧块是经典错)。碎片:反复分配释放,空闲总量够但无连续大块。内存池(固定块大小)= 反碎片手段。</p><p><b>嵌入式慎用原因:</b>①碎片+耗尽不可预测,而设备要 7×24 跑;②时间不确定(分配耗时抖动,坏实时);③多线程堆非线程安全(要加锁)。MISRA-C/航天规范干脆禁堆。替代:静态分配、内存池、RTOS 队列/信号量预创建。FreeRTOS heap_4 带合并算法,相对抗碎片。</p>',
  follow:['realloc 的正确用法(失败时旧块怎么办)?','free 之后指针为什么要置 NULL?'] },

{ id:'c-09', s:'c', lv:4, tags:['大小端','位操作'],
  q:'什么是大端/小端?怎么用代码判断?位操作有什么技巧?',
  a:'<p><b>端序:</b>多字节数据的低字节放低地址=小端(x86、ARM 默认 Cortex 核配小端);高字节放低地址=大端(网络字节序、部分 DSP)。通信协议(如网络栈、部分传感器寄存器)常是大端,收发跨设备必须转(ntohs/htonl)。</p>',
  code:'int is_little(void) {\n    uint16_t x = 0x0001;\n    return *(uint8_t *)&x;          /* 1=小端 */\n}\n/* 取第 n 字节(小端): ((uint8_t*)&v)[n] */',
  a2:'<p><b>位操作技巧(嵌入式寄存器日常):</b>置位 REG |= (1<<n);清位 REG &= ~(1<<n);翻转 REG ^= (1<<n);取位 (REG>>n)&1;多位改写 REG = (REG & ~MASK) | (val<<POS)。修饰词 volatile 搭配使用。其他高频:判断 2 的幂 (x & (x-1))==0;最低有效 1 __builtin_ctz;快速除以 2 的幂 x>>k(注意有符号数的算术移位)。说得出"读-改-写期间防止中断插入"再+1 分。</p>',
  follow:['有符号数右移是算术还是逻辑移位(取决于实现)?','通信协议字节序错了会出现什么现象?'] },

/* ================= C++ cpp ================= */
{ id:'cpp-01', s:'cpp', lv:5, tags:['三大特性','多态'],
  q:'面向对象三大特性是什么?多态在 C++ 里怎么实现?',
  a:'<p><b>封装:</b>public/protected/private 控制访问,数据与操作绑定,隐藏实现细节(不变式保护);<b>继承:</b>is-a 关系,代码复用+抽象层次(接口基类);<b>多态:</b>同一接口、不同行为——"父类指针调用,实际执行子类实现"。</p><p><b>C++ 多态三形态:</b>①编译期:函数重载、模板;②运行期:<b>虚函数</b>。实现机制:基类声明 virtual → 每个类有一张<b>虚函数表(vtable)</b>,每个对象带一个 vptr 指向所属类的 vtable;调用 obj->f() 编译为"经 vptr 找表,按槽位取函数指针跳转"——两次间接寻址,运行期按<b>实际对象类型</b>分发。</p><p><b>必要条件:</b>虚函数+指针/引用调用。对象切片(值传递/值拷贝会把子类切成基类,vptr 变基类表,多态失效)是经典陷阱。</p>',
  svg:'<svg viewBox="0 0 560 190" role="img" aria-label="虚函数表与多态调用"><defs><marker id="ar4" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="currentColor"/></marker></defs><rect x="20" y="60" width="150" height="64" rx="8" fill="rgba(59,130,246,.14)" stroke="#58a6ff"/><text x="40" y="80" font-size="12" fill="#58a6ff">Derived d 对象</text><text x="40" y="98" font-size="11" fill="currentColor">vptr ──→ Derived::vtable</text><text x="40" y="114" font-size="10" fill="#9aa4b2">成员数据…</text><rect x="230" y="20" width="150" height="58" rx="8" fill="rgba(34,197,94,.12)" stroke="#22c55e"/><text x="250" y="40" font-size="12" fill="#22c55e">Base::vtable</text><text x="250" y="58" font-size="10" fill="currentColor">slot0: Base::draw()</text><rect x="230" y="108" width="150" height="58" rx="8" fill="rgba(245,158,11,.12)" stroke="#f59e0b"/><text x="250" y="128" font-size="12" fill="#f59e0b">Derived::vtable</text><text x="250" y="146" font-size="10" fill="currentColor">slot0: Derived::draw()</text><path d="M170,90 C200,90 200,140 230,137" fill="none" stroke="#f59e0b" stroke-width="1.6" marker-end="url(#ar4)"/><text x="400" y="40" font-size="11" fill="currentColor">Base *p = &d; p->draw();</text><text x="400" y="60" font-size="11" fill="currentColor">编译成: (*(p->vptr)[0])(p)</text><text x="400" y="80" font-size="11" fill="#22c55e">→ 走 Derived 表,调 Derived::draw ✅</text><text x="400" y="104" font-size="11" fill="#9aa4b2">若对象按值拷贝给 Base b=d</text><text x="400" y="122" font-size="11" fill="#ef4444">→ 切片!vptr 变 Base 表 ❌</text></svg>',
  follow:['虚函数调用比普通函数慢多少,慢在哪?','构造函数可以是虚函数吗?为什么?'] },

{ id:'cpp-02', s:'cpp', lv:5, tags:['构造析构','顺序'],
  q:'C++ 构造与析构的顺序规则?为什么基类析构函数要声明 virtual?',
  a:'<p><b>构造顺序:</b>①虚拟基类→②基类构造(声明序)→③成员变量构造(声明序,与初始化列表书写顺序无关!)→④本类构造函数体。<b>析构完全相反。</b>初始化列表 vs 赋值:成员/基类无默认构造或 const/引用成员必须用初始化列表。</p><p><b>基类虚析构(必考):</b>`Base *p = new Derived; delete p;` 若 ~Base() 非 virtual,delete 只走基类析构——<b>派生类部分的资源(它 new 的内存、它开的文件)泄漏</b>。规则:作为多态基类使用的类,析构必须 virtual(或继承 std::enable_shared_from_this/不打算多态就用 protected 非虚析构防误用)。经典追问:"析构函数里调用虚函数会怎样?"——按当前构造/析构层级静态分发(此时对象的派生部分已"不存在"),不会多态。</p>',
  code:'struct Base { virtual ~Base() = default; };\nstruct D : Base { std::vector<int> big_; };\nBase *p = new D;\ndelete p;   /* 虚析构 → 先 ~D() 释放 big_,再 ~Base() ✔ */',
  follow:['析构函数里调用虚函数是什么行为?','成员初始化顺序由什么决定(声明序还是列表序)?'] },

{ id:'cpp-03', s:'cpp', lv:5, tags:['深浅拷贝','三法则'],
  q:'什么是浅拷贝/深拷贝?什么是"三/五法则"?',
  a:'<p><b>浅拷贝:</b>编译器默认生成的拷贝逐成员赋值——若成员是指针,两个对象指向同一块堆内存:二次析构(double free)崩溃、修改互相串扰。<b>深拷贝:</b>自定义拷贝,重新分配并复制内容。</p><p><b>三法则(Rule of Three):</b>如果你需要自定义 <b>析构函数</b>、<b>拷贝构造</b>、<b>拷贝赋值</b> 中的任意一个,那几乎肯定三个都需要(因为通常意味着类在管理裸资源)。C++11 扩展为<b>五法则</b>:再加 <b>移动构造/移动赋值</b>。零法则:优先用智能指针/容器成员,让编译器默认生成的版本就正确(unique_ptr 成员自动不可拷贝、可移动)。</p>',
  code:'class Buf {\n    char *p_ = nullptr; size_t n_ = 0;\npublic:\n    ~Buf(){ delete[] p_; }\n    Buf(const Buf& o): p_(new char[o.n_]), n_(o.n_) {          /* 深拷贝 */\n        std::copy(o.p_, o.p_+n_, p_); }\n    Buf& operator=(const Buf& o) {                             /* 自赋值+深拷贝 */\n        if (this != &o) { char *t = new char[o.n_];\n            std::copy(o.p_, o.p_+o.n_, t); delete[] p_;\n            p_ = t; n_ = o.n_; }\n        return *this; }\n};',
  extend:'<b>为什么二次析构会崩溃:</b>浅拷贝后两个对象各持同一裸指针,析构各 delete 一次→同一块堆内存被释放两次,堆管理元数据被破坏。<br><b>三法则的直觉:</b>凡是需要自定义析构(说明类在管理裸资源),编译器默认的逐成员拷贝大概率错误,所以拷贝构造与拷贝赋值要一起给。<br><b>五法则的补充:</b>C++11 后移动构造/移动赋值实现「资源所有权转移」——把临时对象的资源搬过来而不是复制内容,避免深拷贝开销,这是标准库容器高性能的基石。<br><b>零法则:</b>能用 unique_ptr/shared_ptr/vector 等 RAII 成员就别手写资源管理,让编译器默认生成的拷贝/移动语义自动正确(unique_ptr 成员天然不可拷贝、可移动)。',
  follow:['拷贝赋值为什么要判自赋值?','移动赋值怎么写(交换还是释放+接管)?'] },

{ id:'cpp-04', s:'cpp', lv:5, tags:['智能指针'],
  q:'unique_ptr、shared_ptr、weak_ptr 各自的语义与实现?shared_ptr 为什么线程安全又不线程安全?',
  a:'<p><b>unique_ptr:</b>独占所有权,零开销抽象(大小=裸指针,默认删除器),不可拷贝只可 move——所有权转移语义清晰,函数参数/返回值首选。数组特化 unique_ptr<T[]> 自动 delete[]。</p><p><b>shared_ptr:</b>共享所有权,<b>控制块</b>{强引用计数, 弱引用计数, 删除器};拷贝+1、析构−1,归零释放对象,弱计数归零释放控制块。控制块二次分配成本高→ make_shared 一次分配对象+控制块(还异常安全)。内存开销:两指针(对象指针+控制块指针)。</p><p><b>weak_ptr:</b>不增计数(只增弱计数)的观察者,lock() 尝试升级为 shared_ptr。核心用途:打破 <b>shared_ptr 循环引用</b>(A 持 B、B 持 A,计数永不归零→泄漏,把"回边"改 weak);缓存/观察者列表。</p><p><b>线程安全两句话:</b>引用计数操作是原子的(多个线程各持各的 shared_ptr 拷贝,并发拷贝/析构安全);但<b>同一个 shared_ptr 对象</b>被多线程同时读写不安全(要 mutex/atomic&lt;shared_ptr&gt;)。</p>',
  code:'auto a = std::make_shared<Node>();\na->peer = std::weak_ptr<Node>(b);   /* 回边用 weak,断开循环 */\nif (auto p = a->peer.lock()) { /* 对象还活着,安全访问 */ }',
  follow:['make_shared 相比 new+shared_ptr 好在哪?','控制块什么时候销毁(weak 计数的作用)?'] },

{ id:'cpp-05', s:'cpp', lv:4, tags:['STL','迭代器失效'],
  q:'vector 扩容机制?迭代器什么时候失效?怎么安全删除元素?',
  a:'<p><b>扩容:</b>push_back 超容量时按 1.5~2 倍重新分配(VC 1.5x / GCC 2x),拷贝(移动)旧元素、释放旧内存——<b>扩容后所有迭代器/指针/引用全部失效</b>。reserve 预分配是性能优化与稳定迭代器的手段;size/capacity/empty 三兄弟区别要分清。deque 分段连续、list 链式,失效规则不同(list 只失效被删元素)。</p><p><b>安全删除:</b>erase 返回下一个有效迭代器:</p>',
  code:'for (auto it = v.begin(); it != v.end(); ) {\n    if (pred(*it)) it = v.erase(it);   /* erase 返回下一个,避免迭代器失效 */\n    else ++it;\n}\n/* 更好: erase-remove 惯用法 */\nv.erase(std::remove_if(v.begin(), v.end(), pred), v.end());',
  a2:'<p>追问常客:map 删除 it= m.erase(it)(C++11 起返回下一个);范围 for 中 erase 是未定义行为(内部迭代器失控)。emplace_back vs push_back(原地构造,少一次移动);std::string 的 SSO(短串优化,不分配堆)。</p>',
  follow:['vector 的 emplace_back 为什么可能比 push_back 快?','std::string SSO 是什么?'] },

{ id:'cpp-06', s:'cpp', lv:4, tags:['RAII'],
  q:'什么是 RAII?为什么说它是 C++ 资源管理的基石?',
  a:'<p><b>RAII(Resource Acquisition Is Initialization):</b>资源的获取与释放绑定到<b>对象的生命周期</b>——构造获取,析构释放。栈对象离开作用域<b>必然</b>析构(正常 return、异常展开都会走),于是资源释放是自动且异常安全的。</p><p>覆盖一切资源:内存(unique_ptr)、文件(fstream)、锁(lock_guard/unlock_guard)、socket、句柄。对比 C 风格 goto cleanup / 手动 close:任何提前 return 或异常都会跳过手动释放,RAII 无此漏洞——"异常安全"的核心机制。</p>',
  code:'void task() {\n    std::lock_guard<std::mutex> g(mtx);  /* 构造即加锁 */\n    risky();                             /* 抛异常也会解锁 */\n}                                        /* 离开作用域自动解锁 */',
  a2:'<p>工程话术:嵌入式 C++ 里 RAII 封装临界区(构造关中断析构开中断)、外设句柄,代码量减半且不可能忘记解锁。C++ 异常在 MCU 常被关掉(-fno-exceptions),RAII 依然有效(析构照走)。</p>',
  follow:['lock_guard 与 unique_lock 的区别?','RAII 与垃圾回收(GC)相比优劣?'] },

{ id:'cpp-07', s:'cpp', lv:4, tags:['移动语义','完美转发'],
  q:'左值/右值是什么?移动语义解决了什么问题?std::move 做了什么?',
  a:'<p><b>左值</b>:有名字、可取地址(变量);<b>右值</b>:临时值(字面量、函数返回临时)。C++11 引入<b>移动语义</b>:从"将亡"的右值那里<b>窃取</b>资源(指针接管)而不是深拷贝——vector 返回值、容器扩容从 O(n) 拷贝变 O(1) 接管。</p><p><b>std::move 本身不移动任何东西</b>:只是把左值强制转换成右值引用(T&&),让重载决议选中移动构造/移动赋值。真正的"偷资源"发生在移动构造函数里(p_=o.p_; o.p_=nullptr)。</p><p><b>完美转发:</b>模板 T&&(万能引用)+ std::forward&lt;T&gt; 保持实参左右值属性透传给内部构造——emplace_back 的实现基础。移动后对象处于"有效但未定义"状态,只能析构或重新赋值,继续读是错误。</p>',
  code:'std::string a = "long enough string ...";\nstd::string b = std::move(a);  /* b 接管 a 的堆缓冲,零拷贝 */\n/* 此后 a 有效但内容未定义,勿再读 */',
  follow:['std::forward 与 std::move 的区别?','什么类型不能/不该被移动?'] },

{ id:'cpp-08', s:'cpp', lv:4, tags:['关键字'],
  q:'说说 inline、explicit、override、final、constexpr 各自的作用。',
  a:'<ul><li><b>inline:</b>现代含义主要是"允许多重定义"(头文件中安全定义函数),内联与否由编译器决定;类内定义隐式 inline。inline 变量(C++17)解决头文件全局变量。</li><li><b>explicit:</b>禁止单参构造函数的隐式转换——Vector(int n) 会让 vec = 5 编译通过且语义诡异,explicit 后必须显式 Vector(5);拷贝构造也建议 explicit(防传参隐式拷贝陷阱)。</li><li><b>override:</b>显式声明"我在覆写基类虚函数",签名不匹配直接编译错(没有它,签名写错=悄悄定义了一个新函数,多态失效——最隐蔽的 bug 之一)。</li><li><b>final:</b>禁止类被继承或虚函数被进一步覆写(性能提示+设计封闭)。</li><li><b>constexpr:</b>编译期求值,用于常量、数组大小、模板参数;C++14 起可写循环。嵌入式里替代宏常量(有类型、可调试)。</li></ul><p>答这题的策略:每个关键词配一句"它防住了什么 bug",比背定义高级。</p>',
  follow:['为什么类内定义的成员函数隐式 inline?','没有 override 曾经造成过什么样的 bug?'] },

{ id:'cpp-09', s:'cpp', lv:3, tags:['内存管理'],
  q:'C++ 有哪几类内存错误?现代 C++ 怎么系统性避免?',
  a:'<p><b>错误清单:</b>泄漏(new 后丢指针)、悬垂指针(对象已死仍访问——尤其 vector 扩容后保存的指针、返回局部变量引用)、二次释放、越界、未初始化读取、对象切片、循环引用(shared_ptr)。</p><p><b>系统性方案(按层):</b></p><ul><li><b>工具层:</b>智能指针消灭 90% 裸 new/delete;RAII 类管理非内存资源;</li><li><b>设计层:</b>所有权明确(谁持有谁释放;参数传 const&/值/unique_ptr 表达语义);最小化可变全局状态;</li><li><b>验证层:</b>ASan/UBSan(编译期插桩,悬垂/越界当场抓)、Valgrind(泄漏)、-Werror + clang-tidy 静态检查。</li></ul><p>加分:说明"现代 C++ 核心准则:没有裸 new/delete、没有裸 mutex,让正确性由类型系统保证"。</p>',
  follow:['悬垂引用最经典的场景(vector 扩容)怎么防?','shared_ptr 循环引用怎么排查?'] },

/* ================= 嵌入式 emb ================= */
{ id:'emb-01', s:'emb', lv:5, tags:['中断','NVIC'],
  q:'编写中断服务函数(ISR)有哪些原则?为什么?',
  a:'<p><b>原则:"快进快出,只做标记"。</b></p><ul><li><b>短小:</b>ISR 执行期间同级/低级中断被阻塞,主循环也被打断——长 ISR 造成丢中断、控制周期抖动。耗时操作(打印、浮点重计算、协议解析)移到主循环/任务,ISR 只置标志/写缓冲/给信号量。</li><li><b>可重入安全:</b>与主程序共享的变量加 volatile;读-改-写要么关中断保护,要么用原子操作;访问外设寄存器经 volatile 指针。</li><li><b>不调用阻塞/不可重入库:</b>printf(malloc 锁、阻塞发送)、delay;RTOS 环境必须用 FromISR 系列 API。</li><li><b>清标志与返回:</b>入口清中断标志(或按硬件要求)、现场保护交给编译器但避免在 ISR 里调用复杂 C++(异常);ARM 上 ISR 尾用 portYIELD_FROM_ISR 触发调度。</li><li><b>向量与优先级:</b>NVIC 抢占优先级/子优先级分组;RTOS 的 syscall 中断优先级有约束(FreeRTOS configMAX_SYSCALL_INTERRUPT_PRIORITY 之上的中断不能调 FromISR API)。</li></ul>',
  follow:['为什么 printf 不能放 ISR 里(两层原因)?','FreeRTOS 里 FromISR API 的优先级限制?'],
  links:[{t:'软件学习路线图',u:'../06_软件与算法/01_软件学习路线图.html'}] },

{ id:'emb-02', s:'emb', lv:5, tags:['总线对比'],
  q:'UART、SPI、I2C、CAN 四种总线的特点与适用场景?',
  a:'<div class="table-wrap"><table><tr><th></th><th>UART</th><th>SPI</th><th>I2C</th><th>CAN</th></tr><tr><td>线数</td><td>2(TX/RX)</td><td>4(MOSI/MISO/SCK/CS)</td><td>2(SDA/SCL)</td><td>2(CANH/CANL 差分)</td></tr><tr><td>拓扑</td><td>点对点</td><td>一主多从(每从一根CS)</td><td>多主多从(地址寻址)</td><td>多主总线(报文ID仲裁)</td></tr><tr><td>速率</td><td>≤1~5Mbps</td><td>几~几十 Mbps</td><td>100k/400k/3.4M</td><td>≤1Mbps(经典CAN)</td></tr><tr><td>距离</td><td>短(PCB/模块)</td><td>极短(PCB 内)</td><td>短</td><td><b>长(百米级,抗扰强)</b></td></tr><tr><td>硬件细节</td><td>异步,双方波特率一致</td><td>同步,4种CPOL/CPHA模式</td><td>开漏+上拉,线与</td><td>差分,120Ω双端端接</td></tr><tr><td>典型用途</td><td>调试口、GPS、模组</td><td>Flash、屏幕、ADC、IMU</td><td>低速传感器、配置寄存器</td><td>汽车/机器人节点互联</td></tr></table></div><p>加分点:选型逻辑——板上高速外设 SPI(要吞吐)、多低速传感器挂总线 I2C(省引脚)、板间/车规可靠性 CAN(差分抗扰+仲裁+错误处理强);机器人关节级联常用 CAN(可长期位速率与错误受限恢复)。</p>',
  follow:['I2C 为什么要开漏+上拉,能不能推挽?','CAN 的显性/隐性电平与线与仲裁的关系?'],
  links:[{t:'通信与控制算法升级路线',u:'../04_升级进阶/09_通信与控制算法升级路线.html'}] },

{ id:'emb-03', s:'emb', lv:4, tags:['I2C时序','仲裁'],
  q:'I2C 的时序要点?多主仲裁怎么工作?',
  a:'<p><b>基本时序:</b>SCL 高电平期间 SDA 必须稳定;SDA 变化只发生在 SCL 低电平(否则是 START/S 停止条件)。起始:SCL 高时 SDA 由高→低;停止:SCL 高时 SDA 低→高。字节高位先传,第 9 个时钟为应答位 ACK(接收方拉低 SDA)。</p><p><b>开漏+线与:</b>所有器件输出开漏,总线电平=各器件"与"——谁都可以拉低,谁都可能被别人拉低。这是仲裁的物理基础。</p><p><b>多主仲裁:</b>两主同时发,各自边发边"回读" SDA;若自己发 1 却读到 0(对方发 0),自己退出仲裁、转从机监听——<b>0(低电平)胜出</b>,等价于报文地址逐位比大小,地址小者赢;输家等总线空闲重试,全程无破坏、无中心仲裁器。时钟同步(时钟拉伸)同理:多主时钟线相与取慢者,从机也可拉低 SCL 让主机等待(慢速从机必备)。</p>',
  svg:'<svg viewBox="0 0 560 170" role="img" aria-label="I2C 时序与仲裁"><text x="10" y="16" font-size="11" fill="currentColor">仲裁:两主机同时发,发1却读到0者退出(0 获胜)</text><line x1="20" y1="60" x2="540" y2="60" stroke="#6b7280" stroke-width="1"/><text x="4" y="64" font-size="10" fill="#9aa4b2">SCL</text><path d="M20,78 L20,44 L60,44 L60,78 L100,78 L100,44 L140,44 L140,78 L180,78 L180,44 L220,44 L220,78 L260,78 L260,44 L300,44 L300,78 L340,78 L340,44 L380,44 L380,78 L420,78 L420,44 L460,44 L460,78 L500,78 L500,44 L540,44" fill="none" stroke="#9aa4b2" stroke-width="1.4"/><text x="4" y="108" font-size="10" fill="#58a6ff">SDA_A</text><path d="M20,126 L20,92 L60,92 L60,126 L100,126 L100,92 L220,92 L220,126 L260,126 L260,92 L300,92 L300,126 L380,126 L380,92 L540,92" fill="none" stroke="#58a6ff" stroke-width="1.6"/><text x="4" y="152" font-size="10" fill="#f59e0b">SDA_B</text><path d="M20,170 M20,148 L20,134 L60,134 L60,168 L140,168 L140,134 L220,134 L220,168 L340,168 L340,134 L540,134" fill="none" stroke="#f59e0b" stroke-width="1.6" transform="translate(0,0)"/><text x="105" y="88" font-size="9" fill="#ef4444">A发1但B拉低→A检测到0</text><text x="300" y="88" font-size="9" fill="#ef4444">A退出仲裁,B继续独占总线</text></svg>',
  follow:['时钟拉伸(clock stretching)是什么,谁用?','I2C 总线卡死(SDA被拉低)怎么恢复(9个时钟法)?'] },

{ id:'emb-04', s:'emb', lv:4, tags:['DMA'],
  q:'DMA 是什么?什么场景用?要注意什么?',
  a:'<p><b>DMA(直接存储器访问):</b>外设与内存间搬数据不经 CPU,由 DMA 控制器完成;CPU 只在整块搬完时收一个中断。收益:①CPU 占用从"每字节中断"降到"每块中断";②搬运与计算并行(双缓冲);③高速外设(SPI 屏、ADC 连续采样)不丢数据。</p><p><b>典型场景:</b>ADC 多通道连续采样→DMA 循环缓冲;UART 大数据收发(idle 中断+DMA 不定长接收);SPI 驱动 TFT/OLED 帧缓冲;内存到内存块拷贝。</p><p><b>注意:</b>①缓冲区地址对齐、不可跨某些边界;②cache 一致性(M7/DMA 需失效/清理 cache 或放非缓存区);③双缓冲(半满+全满中断)实现边采边算;④与 CPU 共享的缓冲加 volatile/内存屏障;⑤RTOS 下 DMA 完成用信号量/任务通知唤醒任务而非忙等。</p>',
  follow:['ADC+DMA 双缓冲怎么设计(半传输中断)?','DMA 缓冲为什么要注意 cache 一致性?'] },

{ id:'emb-05', s:'emb', lv:4, tags:['看门狗'],
  q:'看门狗的原理?独立看门狗与窗口看门狗的区别?怎么"科学喂狗"?',
  a:'<p><b>原理:</b>计数器自由递减,减到 0 复位 MCU;软件必须在超时前"喂狗"(重装计数)。程序跑飞(死循环/HardFault/等待外设卡死)→无法按时喂狗→自动复位自恢复。</p><p><b>IWDG(独立):</b>独立 LSI 时钟(主时钟坏了也能跑),超时较长(ms~s 级),当"最后保险"。<b>WWDG(窗口):</b>必须在<b>时间窗口内</b>喂——喂早了(程序跑得太快,可能跑飞成小循环)也复位!还能带中断在复位前留遗言(存日志/备份寄存器)。窗口看门狗能发现"程序还在跑但跑错节奏"的故障,独立看门狗只能发现"彻底不跑"。</p><p><b>科学喂狗:</b>①喂狗放主循环/关键任务,绝不放定时器中断(程序主循环死了中断还活着=喂狗失效);②多任务系统用"全部关键任务都打卡"的汇聚标志位才喂(检查任务存活);③喂狗前做关键状态自检(RAM 校验、栈水位);④配合复位原因寄存器记录(IWDG 复位上报日志)。</p>',
  follow:['为什么喂狗不能放在定时器中断里?','复位后怎么知道是看门狗复位(原因寄存器)?'] },

{ id:'emb-06', s:'emb', lv:4, tags:['Bootloader','IAP'],
  q:'Bootloader/IAP 的原理与流程?跳转前要做什么?',
  a:'<p><b>双区(或多区)结构:</b>FLASH 分 Bootloader 区(0x08000000)+ APP 区(如 0x08010000)+ 可选备份区/参数区。上电先跑 Boot:检查 APP 有效性(CRC/栈顶合法性)→有效则跳转,无效/收到升级命令则进入升级流程(Ymodem/串口/SD/USB/无线收固件写 FLASH)。</p><p><b>跳转三件事(必考):</b>①关闭并清除所有中断源( NVIC 全禁、外设 deinit,关 SysTick)——否则 APP 一开中断就跳回 Boot 的向量;②把 APP 区首字(栈顶值)写入 MSP(`__set_MSP(*(uint32_t*)APP_ADDR)`);③取第二字(复位向量)作为函数指针跳转。</p><p><b>APP 侧:</b>中断向量表重定位(SCB->VTOR = APP_BASE 或 `SCB->VTOR=FLASH_BASE|OFFSET`),链接脚本/分散加载改 FLASH 起址;STM32 还有系统存储器 Bootloader(串口 ISP)与双 bank 切换升级。加分:OTA=IAP+无线传输+版本管理+A/B 分区回滚。</p>',
  code:'typedef void (*pFunc)(void);\nuint32_t sp = *(volatile uint32_t*)APP_ADDR;\nuint32_t pc = *(volatile uint32_t*)(APP_ADDR+4);\n__disable_irq(); /* + 关外设/SysTick/清NVIC挂起 */\n__set_MSP(sp);\n((pFunc)pc)();',
  follow:['为什么必须重定位向量表(VTOR)?','A/B 双分区升级怎么保证不断电变砖?'] },

{ id:'emb-07', s:'emb', lv:3, tags:['低功耗'],
  q:'MCU 的低功耗模式(Sleep/Stop/Standby)区别?做低功耗产品的方法论?',
  a:'<div class="table-wrap"><table><tr><th>模式</th><th>内核</th><th>时钟/外设</th><th>RAM</th><th>典型电流</th><th>唤醒</th></tr><tr><td>睡眠 Sleep</td><td>停</td><td>保持</td><td>保持</td><td>几 mA</td><td>任意中断(μs 级恢复)</td></tr><tr><td>停止 Stop</td><td>停</td><td>HSI 可保留,多数外设停</td><td><b>保持</b></td><td>几十 μA</td><td>EXTI(唤醒后接着跑)</td></tr><tr><td>待机 Standby</td><td>停</td><td>全停,仅 PWR/RTC/IWDG</td><td><b>丢失(仅备份域)</b></td><td>~1μA</td><td>WKUP/RTC(复位式重启)</td></tr></table></div><p><b>方法论(分层砍功耗):</b>①任务级——事件驱动(RTC 定时/中断唤醒),杜绝轮询;②时钟级——降主频、关未用外设时钟、动态调频;③硬件级——关 LDO/传感器电源(MOS 开关)、上拉优化、测量验证(电流表/功耗剖析,μA 级)。产品案例:传感器节点"每 10min 醒 100ms 采样发报",平均电流≈占空比×工作电流,电池寿命按此折算。</p>',
  follow:['Stop 模式唤醒后时钟什么状态(HSI)?','待机模式唤醒后程序从头跑,怎么保存状态(备份寄存器/RTC)?'] },

{ id:'emb-08', s:'emb', lv:4, tags:['调试','HardFault'],
  q:'程序出现 HardFault/段错误,你的排查流程?',
  a:'<p><b>嵌入式 HardFault 排查五步:</b></p><ul><li><b>①抓现场:</b>HardFault_Handler 里入栈帧(PC/LR/xPSR/R0-R3…)保存 + 断点/死循环等调试器; Cortex-M 可直接看出错指令地址(入栈 PC);</li><li><b>②看原因:</b>CFSR/HFSR/BFAR/MMFAR 寄存器分类:用法错误(除零/未对齐)、总线错误(访问非法地址——野指针/外设未开时钟)、内存错误(栈溢出踩 MPU);</li><li><b>③定位代码:</b>PC 值在 map 文件/addr2line 反查函数行号;</li><li><b>④常见嫌疑按概率:</b>栈溢出(局部大数组/递归,调大栈或查水位)、野指针/数组越界、未初始化结构体、volatile 缺失导致的优化问题、中断与主循环竞态、Flash 操作期间取指;</li><li><b>⑤复现加固:</b>加 asserts/栈填充检测(0xA5)/MPU 保护,工具(Sanitizers、Ozone/RTT 日志)。</li></ul><p>通用素质:用"寄存器→地址→反汇编→源码"证据链回答,别猜。</p>',
  follow:['入栈的 PC 一定是出错指令吗(EXC_RETURN/精确性)?','栈溢出怎么在线检测(水位法)?'] },

{ id:'emb-09', s:'emb', lv:3, tags:['外设配置'],
  q:'配置一个 MCU 外设(如 UART)的标准流程?工程上怎么组织外设驱动代码?',
  a:'<p><b>标准六步(以 UART 为例):</b>①开时钟(GPIO+USART+可选 DMA);②GPIO 复用映射(TX 复用推挽/RX 上拉输入,AF 选对);③外设参数(波特率、8N1、硬件流控);④中断/DMA 配置(NVIC 优先级、DMA 通道);⑤使能(USART_CR1 UE/TE/RE);⑥收发处理(中断 ISR 收到环形缓冲,主程序解析)。易错:忘了 AF 复用、波特率时钟源(PCLK1 vs PCLK2 除数表)、NVIC 分组与优先级冲突。</p><p><b>驱动组织(加分):</b>分层——HAL/寄存器层(厂商)→中间驱动层(uart_open/read/write/ioctl,环形缓冲+回调,面向接口)→应用层(协议解析状态机)。要点:不阻塞(发送用 DMA/中断)、超时机制、错误处理(溢出 ORE 清标志)、多实例参数化(struct uart_dev 实例化)、可测试(依赖注入回调)。说得出"把硬件差异关在驱动层,应用只面向接口"即达标。</p>',
  follow:['UART 接收为什么常用空闲中断+DMA?','环形缓冲为什么要关中断保护读写指针?'] },

/* ================= FreeRTOS frt ================= */
{ id:'frt-01', s:'frt', lv:5, tags:['任务状态','调度'],
  q:'FreeRTOS 任务有哪几种状态?调度器怎么工作?',
  a:'<p><b>四状态:</b>运行(Running)、就绪(Ready)、阻塞(Blocked,等待事件/延时,让出 CPU)、挂起(Suspended,vTaskSuspend 挂起,任何事件唤不醒只有 Resume)。就绪→运行由调度器选;运行→阻塞靠等事件(vTaskDelay/队列/信号量);阻塞→就绪靠事件到来。</p><p><b>调度规则:</b>①<b>抢占式优先级调度</b>:永远运行最高优先级的就绪任务——高优任务一就绪立即抢占低优(需 configUSE_PREEMPTION=1);②<b>同优先级时间片轮转</b>(configUSE_TIME_SLICING):tick 中断轮流;③空闲任务(Idle)优先级 0 兜底,可挂钩子做低优先级后台活与内存回收。调度点:tick 中断、API 阻塞/释放、中断退出(portYIELD_FROM_ISR)。延时的正确姿势:vTaskDelay/vTaskDelayUntil(绝对延时,控制周期不累积漂移——做 1kHz 控制环必用 until)。</p>',
  svg:'<svg viewBox="0 0 560 180" role="img" aria-label="FreeRTOS 任务状态机"><defs><marker id="ar5" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="currentColor"/></marker></defs><circle cx="130" cy="40" r="26" fill="rgba(34,197,94,.16)" stroke="#22c55e"/><text x="130" y="44" font-size="11" fill="#22c55e" text-anchor="middle">运行</text><circle cx="390" cy="40" r="26" fill="rgba(59,130,246,.16)" stroke="#58a6ff"/><text x="390" y="44" font-size="11" fill="#58a6ff" text-anchor="middle">就绪</text><circle cx="390" cy="130" r="26" fill="rgba(245,158,11,.16)" stroke="#f59e0b"/><text x="390" y="134" font-size="11" fill="#f59e0b" text-anchor="middle">阻塞</text><circle cx="130" cy="130" r="26" fill="rgba(239,68,68,.14)" stroke="#ef4444"/><text x="130" y="134" font-size="11" fill="#ef4444" text-anchor="middle">挂起</text><line x1="156" y1="40" x2="364" y2="40" stroke="currentColor" stroke-width="1.4" marker-end="url(#ar5)"/><line x1="364" y1="32" x2="156" y2="32" stroke="currentColor" stroke-width="1.4" marker-end="url(#ar5)"/><text x="248" y="26" font-size="9.5" fill="currentColor" text-anchor="middle">被高优先级抢占 / 恢复</text><text x="252" y="56" font-size="9.5" fill="currentColor" text-anchor="middle">调度器选中(最高优先级就绪)</text><line x1="402" y1="66" x2="402" y2="104" stroke="currentColor" stroke-width="1.4" marker-end="url(#ar5)"/><text x="414" y="88" font-size="9.5" fill="currentColor">等事件/延时</text><line x1="366" y1="122" x2="336" y2="60" stroke="currentColor" stroke-width="0" /><path d="M378,106 C300,90 200,80 158,58" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#ar5)"/><text x="240" y="82" font-size="9.5" fill="currentColor">事件到来/超时到</text><line x1="156" y1="118" x2="256,86" x2="256" y2="86" stroke="#ef4444" stroke-width="0"/><path d="M158,116 C220,100 280,70 366,48" fill="none" stroke="#ef4444" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#ar5)"/><text x="230" y="112" font-size="9.5" fill="#ef4444">vTaskResume</text><text x="12" y="170" font-size="10" fill="#9aa4b2">阻塞任务不占CPU——这就是RTOS相对裸机大循环的价值:多个"看似并行"的周期任务互不阻塞</text></svg>',
  follow:['vTaskDelay 与 vTaskDelayUntil 的区别(周期任务用哪个)?','空闲任务做什么,钩子里不能干什么?'] },

{ id:'frt-02', s:'frt', lv:5, tags:['通信','IPC'],
  q:'FreeRTOS 的队列、信号量、互斥量、事件组、任务通知分别适合什么场景?',
  a:'<div class="table-wrap"><table><tr><th>机制</th><th>本质</th><th>适用</th><th>要点</th></tr><tr><td>队列 Queue</td><td>FIFO 拷贝传数据</td><td>任务间传消息(传感器数据/命令)</td><td>传值不传指针(除非指向长生命周期数据);满了可阻塞</td></tr><tr><td>二值信号量</td><td>0/1 计数</td><td>任务同步("事件发生了")、ISR 释放任务处理</td><td>give/take;不定义"谁的数据"</td></tr><tr><td>计数信号量</td><td>多值计数</td><td>资源池管理(N 个缓冲区)、事件累计</td><td>最大值=资源数</td></tr><tr><td>互斥量 Mutex</td><td>带优先级继承的二值锁</td><td><b>保护共享资源(任务间临界区)</b></td><td>谁拿谁还;不能在 ISR 用;优先级继承防反转</td></tr><tr><td>事件组</td><td>多比特位</td><td>等多条件("A且B且C"或"任一")</td><td>xEventGroupWaitBits 逻辑或/与</td></tr><tr><td>任务通知</td><td>TCB 内嵌轻量信箱</td><td>一对一高频率同步(推荐默认)</td><td>零创建开销、更快;不能广播(每任务一个)</td></tr></table></div><p><b>决策口诀:传数据用队列;保护资源用互斥;单向事件用通知/二值信号量;多条件组合用事件组。ISR 一律 FromISR 版 API+portYIELD_FROM_ISR。</b></p>',
  follow:['队列传指针有什么风险?','任务通知为什么比信号量快?'] },

{ id:'frt-03', s:'frt', lv:5, tags:['优先级反转','继承'],
  q:'什么是优先级反转?火星探路者事故怎么发生的?FreeRTOS 怎么解决?',
  a:'<p><b>经典三角色:</b>高优 H、中优 M、低优 L,H 与 L 共享一把锁。</p><ol><li>L 拿锁访问共享资源;</li><li>H 就绪抢占 L,访问资源需锁→阻塞等 L 释放;</li><li>M 就绪(M 不需要锁)抢占 L——<b>L 被压着跑不了,H 实际等待优先级比自己低的 M</b>,等效"高优被中优反转压制",严重时看门狗超时。</li></ol><p><b>1997 火星探路者:</b>高优先气象任务与低优先总线任务共享信息,中优先通信任务长时间插队→高优任务饿死→看门狗复位,反复重启。NASA 远程打开优先级继承修复。</p><p><b>FreeRTOS 解决:</b>①互斥量(xSemaphoreCreateMutex)内置<b>优先级继承</b>:H 阻塞在锁上时,持锁的 L 临时被抬升到 H 的优先级,压过 M 尽快跑完临界区放锁,反转窗口压到最小;②注意:继承只在互斥量上,二值信号量(binary semaphore)没有继承——所以"保护共享资源必须用 Mutex,信号量只做同步";③优先级继承不能解决的极端:嵌套锁的死锁(层次化上锁顺序+超时)。VxWorks 当时还提供了优先级天花板,面试提一句加分。</p>',
  svg:'<svg viewBox="0 0 560 180" role="img" aria-label="优先级反转时序"><line x1="60" y1="20" x2="60" y2="160" stroke="currentColor"/><line x1="250" y1="20" x2="250" y2="160" stroke="currentColor"/><line x1="340" y1="20" x2="340" y2="160" stroke="currentColor"/><line x1="470" y1="20" x2="470" y2="160" stroke="currentColor"/><text x="46" y="16" font-size="10" fill="#9aa4b2">t0</text><text x="236" y="16" font-size="10" fill="#9aa4b2">t1</text><text x="326" y="16" font-size="10" fill="#9aa4b2">t2</text><text x="456" y="16" font-size="10" fill="#9aa4b2">t3</text><rect x="60" y="30" width="410" height="16" fill="rgba(239,68,68,.25)" stroke="#ef4444" stroke-width="0.8"/><text x="8" y="42" font-size="10" fill="#ef4444">高H</text><rect x="250" y="52" width="90" height="16" fill="rgba(245,158,11,.3)" stroke="#f59e0b" stroke-width="0.8"/><rect x="400" y="52" width="70" height="16" fill="rgba(245,158,11,.3)" stroke="#f59e0b" stroke-width="0.8"/><text x="8" y="64" font-size="10" fill="#f59e0b">中M</text><rect x="60" y="74" width="190" height="16" fill="rgba(34,197,94,.22)" stroke="#22c55e" stroke-width="0.8"/><rect x="340" y="74" width="60" height="16" fill="rgba(34,197,94,.22)" stroke="#22c55e" stroke-width="0.8"/><text x="8" y="86" font-size="10" fill="#22c55e">低L</text><path d="M190,60 C220,60 220,100 250,100" fill="none" stroke="#22c55e" stroke-width="1.2" marker-end="url(#ar5)"/><text x="120" y="106" font-size="9.5" fill="#9aa4b2">t1: L持锁被H抢,H等锁阻塞</text><path d="M250,116 C280,116 280,80 340,80" fill="none" stroke="#ef4444" stroke-width="1.2" marker-end="url(#ar5)"/><text x="230" y="132" font-size="9.5" fill="#ef4444">t2~t3: M两次插队,L跑不完,H被"反转"饿等</text><text x="60" y="152" font-size="9.5" fill="#22c55e">互斥量优先级继承:持锁L临时升到H级,M插不了队,锁尽快释放</text><text x="60" y="168" font-size="9.5" fill="#9aa4b2">信号量无继承→保护共享资源必须用互斥量(Mutex)</text></svg>',
  follow:['优先级继承和优先级天花板区别?','嵌套持锁为什么会死锁,怎么防?'] },

{ id:'frt-04', s:'frt', lv:4, tags:['内存管理','heap'],
  q:'FreeRTOS 的 heap_1~heap_5 各是什么?怎么选?',
  a:'<ul><li><b>heap_1:</b>只分配不释放(无 free)。最简单、无碎片、绝对安全——任务全在初始化时创建的产品用;</li><li><b>heap_2:</b>支持 free 但<b>不合并</b>相邻空闲块→碎片;已基本被 heap_4 取代;</li><li><b>heap_3:</b>包装编译器 libc 的 malloc/free(加线程锁),大小由链接器堆决定;受 libc 实现质量影响;</li><li><b>heap_4(最常用):</b>首次适应+按 8 字节对齐+<b>合并相邻空闲块</b>,抗碎片好;堆区可指定(数组);</li><li><b>heap_5:</b>heap_4 + 多段不连续内存(SRAM 分散在多个地址区域的高端 MCU)。</li></ul><p><b>选型:</b>任务/队列全静态创建→heap_1;运行期有创建删除→heap_4;内存区域分散→heap_5。调试工具:xPortGetFreeHeapSize()(余量)、xPortGetMinimumEverFreeHeapSize()(历史最低水位——离 OOM 多近)、uxTaskGetSystemStates 查任务栈水位。嵌入式稳健派:configSUPPORT_STATIC_ALLOCATION 全静态,连堆都不要。</p>',
  follow:['怎么评估最小堆水位是否安全?','静态创建任务(Static)相比动态的好处?'] },

{ id:'frt-05', s:'frt', lv:4, tags:['栈大小','溢出'],
  q:'任务的栈大小怎么定?栈溢出怎么检测?',
  a:'<p><b>定量法:</b>栈消耗=局部变量+函数调用深度(每层返回地址/寄存器保存,ARM 上每次中断额外压栈 ~64~104 字节)+库函数缓冲(printf 家族吃 1~2KB!)+中断嵌套余量。<b>实用流程:</b>先按经验放大(xTaskCreate 的 usStackDepth 单位是"字"不是字节,STM32 上 ×4)→跑全部业务路径(含最深递归/最大报文+最高中断负载)→用 uxTaskGetStackHighWaterMark() 读历史最小剩余,留 30~50% 裕量定稿。</p><p><b>溢出检测两层:</b>①FreeRTOS 栈溢出钩子(configCHECK_FOR_STACK_OVERFLOW=1 查指针越界 / =2 栈底填充 0xA5A5 图案被涂改检测,更强)→vApplicationStackOverflowHook 打日志复位;②MPU 版本(MPU_wrappers)硬件隔离,栈越界直接 Fault。溢出现象往往诡异:任务"发疯"、HardFault 在无关函数、变量莫名变值——排障时先查水位。</p>',
  follow:['为什么 printf 会吃这么多栈(浮点变参+缓冲)?','检测方法2(填充法)为什么比方法1强?'] },

{ id:'frt-06', s:'frt', lv:4, tags:['临界区','中断交互'],
  q:'FreeRTOS 里怎么保护临界区?任务与中断共享数据怎么做?',
  a:'<p><b>工具谱系(从轻到重):</b></p><ul><li><b>任务级互斥:</b>taskENTER_CRITICAL()/EXIT(关可屏蔽中断到 configMAX_SYSCALL 层级+调度锁计数),短小代码段用;</li><li><b>互斥量:</b>可阻塞、可长持有(临界区里有 API 调用/IO),带优先级继承;</li><li><b>挂起调度器:</b>vTaskSuspendAll()(只防任务抢占不防中断,保护"任务间共享、中断不碰"的数据);</li><li><b>原子/免锁设计:</b>单字读写天然原子(Cortex-M 对齐 32bit);环形缓冲单读单写 SPSC 无锁;seqlock/双缓冲。</li></ul><p><b>任务↔中断共享:</b>互斥量不能在 ISR 用!正确姿势:①短数据:关中断窗口读写(taskENTER_CRITICAL_FROM_ISR 版);②事件+数据:队列 xQueueSendFromISR(数据随队列拷贝,天然隔离)+portYIELD_FROM_ISR;③标志位:volatile 变量+二值信号量/任务通知。口诀"<b>ISR 里只搬运不处理,数据经队列过墙</b>"。</p>',
  follow:['互斥量和关中断保护临界区的适用差异?','SPSC 环形缓冲为什么可以无锁?'] },

{ id:'frt-07', s:'frt', lv:3, tags:['软件定时器','钩子'],
  q:'FreeRTOS 软件定时器怎么工作?回调里能做什么?守护任务是什么?',
  a:'<p><b>机制:</b>软件定时器由<b>定时器服务任务(Timer Daemon/守护任务)</b>统一管理:所有 xTimerStart/Stop 请求经<b>定时器命令队列</b>发给守护任务,它按到期表依次执行回调——所以回调<b>运行在守护任务上下文</b>,不是中断!</p><p><b>回调纪律(必考):</b>①不能阻塞(不能 vTaskDelay/拿不到锁就等)——会拖延<b>所有</b>软件定时器;②要短;③不能用 FromISR API(它不是 ISR)。需要重活:回调里给任务通知,让专门任务干活。回调里可以安全调用 xTimerStart 等 non-blocking 定时器 API。</p><p><b>单次 vs 周期:</b>pdONE_SHOT/pdPERIODIC;周期定时器按创建参数重复。优先级/configTIMER_TASK_PRIORITY 决定定时精度;configTIMER_QUEUE_LENGTH 决定命令排队容量(溢出=启动失败返回失败,要检查返回值)。对比硬件定时器:软件定时器精度= tick 级(ms)、数量无限、不占硬件资源;硬实时(μs)必须硬件定时器+ISR。</p>',
  follow:['回调里 vTaskDelay 会发生什么(连锁效应)?','软件定时器精度由什么决定?'] },

{ id:'frt-08', s:'frt', lv:3, tags:['tick','中断优先级'],
  q:'FreeRTOS 的 tick 与 configMAX_SYSCALL_INTERRUPT_PRIORITY 为什么要关注?',
  a:'<p><b>tick:</b>RTOS 心跳,configTICK_RATE_HZ(常 1000Hz),驱动时间片轮转与超时;SysTick 中断里递增计数、检查延时到期任务。vTaskDelayUntil 的精度极限=tick 周期±调度延迟,1kHz 控制环常用它;更高精度用硬件定时器直接触发。</p><p><b>configMAX_SYSCALL_INTERRUPT_PRIORITY(重要且易踩):</b>NVIC 优先级<b>数值小于</b>该值(即硬件优先级更高/更紧急)的中断,<b>不允许调用任何 FromISR API</b>——因为内核在临界区只屏蔽到该层级,更高紧急中断若调用内核 API 就可能在内核数据结构更新中被重入,损坏内核。规则:①要调 FromISR 的中断,其抢占优先级数值 ≥ 该配置;②真正超高实时中断(位置比较/保护封波)放在配置之上,但只能用裸标志位/寄存器与任务通信。数值方向要分清:Cortex-M 优先级数值越小越紧急——这一句话答对就赢一半。</p>',
  follow:['为什么超高优先级中断不能碰内核 API(临界区屏蔽范围)?','把 tick 提到 10kHz 有什么代价?'] },

{ id:'frt-09', s:'frt', lv:3, tags:['裸机对比'],
  q:'什么时候该用 RTOS,什么时候裸机就够?',
  a:'<p><b>裸机(超级循环+中断)适合:</b>逻辑简单、任务单一、事件少;硬实时确定性要求极高(无调度抖动);资源极小(几 KB Flash/RAM);认证简单的场景。伪并发靠状态机+标志位,代码量小但随复杂度指数劣化("意大利面")。</p><p><b>RTOS 适合:</b>多个不同周期的并发活动(1kHz 控制+100Hz 通信+10Hz 日志+UI)、有阻塞操作(网络/文件/慢速传感器)、需要超时/优先级管理、团队协作模块化。代价:RAM(每任务栈)、Flash(内核 ~6KB)、学习成本(竞态/优先级反转/栈溢出坑)、微小调度抖动。</p><p><b>判断口诀(加分):</b>"一个循环装得下就裸机,装不下才上 RTOS;上了 RTOS 就要敬畏并发(共享即加锁、ISR 只搬运)"。人形关节驱动器:常见"裸机+定时器主循环"做电流环极致确定性,通信/日志用轻量协程或 RTOS——分层取舍比教条更专业。</p>',
  follow:['裸机怎么模拟并发(时间片轮询/协作调度)?','控制环对抖动敏感,RTOS 里怎么保证硬实时段?'] },

/* ================= NPU与数字IC ic ================= */
{ id:'ic-01', s:'ic', lv:3, tags:['设计流程','RTL到GDSII'],
  q:'一颗数字芯片从 RTL 到量产要经过哪些步骤?前端和后端各做什么?',
  a:'<p><b>数字前端(决定「逻辑对不对」):</b>①Spec/架构算法( C 模型建模)→②RTL 设计(Verilog)→③功能仿真(验证逻辑)→④综合( syn:RTL→门级网表,约束驱动)→⑤DFT 插入(可测性)/形式验证(等价性检查)→⑥STA 静态时序分析(签时序)。前端 fail 最多回到 RTL 重写。</p><p><b>数字后端(决定「造得出来、跑得够快」):</b>⑦布局布线 PnR(floorplan→place→route)→⑧物理验证 DRC/LVS(设计规则/版图与网表一致)→⑨签核(时序/功耗/电压降)→⑩交付 GDSII→流片(tapeout)→封装测试→量产。流片后发现功能 bug 只能改版(re-spin),一次数月与百万级损失。</p><p><b>一句话总结:</b>前端「逻辑对」,后端「物理落地」;综合网表+SDC 时序约束是两者的交接物。</p>',
  follow:['综合和布局布线的时序估计为什么会有偏差(线负载模型)?','DFT 插入的 scan 链是干什么的?'],
  extend:'面试官想听「回退成本」的量级概念:RTL 阶段改 bug 几乎免费,流片后改 bug 要重新投片——所以前端验证(仿真+形式验证+UVM)投入占项目一半以上是常态。',
  links:[{t:'芯片设计流程与AHB/AXI',u:'../10_NPU与数字IC设计/09_芯片设计流程与AHB_AXI总线.html'},{t:'数字设计环境与工具链',u:'../10_NPU与数字IC设计/02_数字设计环境与工具链.html'}] },

{ id:'ic-02', s:'ic', lv:5, tags:['Verilog','阻塞非阻塞'],
  q:'Verilog 的阻塞赋值(=)和非阻塞赋值(<=)有什么区别?什么时候用哪个?',
  a:'<p><b>一句话结论:</b>组合逻辑 always @(*) 用阻塞 <b>=</b>,时序逻辑 always @(posedge clk) 用非阻塞 <b><=</b>。</p><p><b>语义区别:</b>阻塞赋值立即执行(顺序语句,像 C);非阻塞赋值在时间步结束时统一更新(所有 RHS 先采样旧值,再一起赋给 LHS)——这正是寄存器「时钟沿同时翻转」的语义。</p><p><b>经典反面教材:</b>时序块里写 <code>always @(posedge clk) b = a; c = b;</code> 会把 b 的新值传给 c(两个寄存器被综合成一个),违背「流水线两级」意图;而 <code>b <= a; c <= b;</code> 综合出两级移位。组合块里反着用非阻塞,则要多轮仿真才收敛,还可能残存旧值产生 latch 风险。</p><p><b>追问弹药:</b>同一 always 块不要混用两种赋值;组合块敏感列表用 @(*) 防漏信号生成意外 latch。</p>',
  follow:['always @(*) 为什么可能综合出锁存器?怎么避免?','非阻塞赋值的「时间步结束统一更新」在仿真调度里对应哪个 region?'],
  extend:'面试官常追「为什么会有这个规则」:本质是仿真调度语义与综合电路模型的对齐问题——非阻塞对应 NFS(非阻塞赋值语句)的 NBA region 更新,正好匹配 D 触发器沿翻转。',
  links:[{t:'Verilog语法与状态机设计',u:'../10_NPU与数字IC设计/03_Verilog语法与状态机设计.html'}] },

{ id:'ic-03', s:'ic', lv:4, tags:['状态机','FSM'],
  q:'Mealy 型和 Moore 型状态机的区别是什么?为什么推荐三段式写法?',
  a:'<p><b>区别:</b>Moore 输出只由当前状态决定(输出经寄存器,无组合毛刺,但响应慢一拍);Mealy 输出依赖状态+当前输入(响应快一拍,但组合输出可能毛刺,且输入上的噪声直接透传到输出)。</p><p><b>三段式写法:</b>①时序块:状态寄存器 <code>state <= next_state</code>(非阻塞);②组合块:次态译码 <code>always @(*) case(state)</code>;③输出块:寄存输出或组合输出独立成段。优点:结构清晰易改、综合器友好(时序路径短)、输出可以打一拍消除毛刺。</p><p><b>工程要点(常追问):</b>状态编码用参数/localparam(或独热提高速度);必须写 default 分支防跑飞;跨时钟域的状态要先同步再译码。NPU 控制 FSM(取指→解码→计算→写回)就是典型三段式。</p>',
  follow:['状态机跑飞(进入非法状态)有哪些自恢复手段?','独热编码和二进制编码各适合什么场合?'],
  links:[{t:'Verilog语法与状态机设计',u:'../10_NPU与数字IC设计/03_Verilog语法与状态机设计.html'},{t:'NPU项目实战上·控制模块',u:'../10_NPU与数字IC设计/10_NPU项目实战上_Spec与控制模块.html'}] },

{ id:'ic-04', s:'ic', lv:5, tags:['FIFO','CDC','格雷码'],
  q:'异步 FIFO 为什么要用格雷码做指针?FIFO 深度怎么计算?',
  a:'<p><b>格雷码的原因:</b>写指针(多位二进制)跨到读时钟域要经两级同步器,多位二进制值变化时可能多位同时翻转,采样可能得到「既不是旧值也不是新值」的中间态,导致空/满误判、数据覆写。格雷码相邻数只有 1 位变化,亚稳态采样最坏错成相邻值,空/满判断只会保守不会失效——这是唯一稳定的本质原因,答题必须说到。</p><p><b>空/满判断:</b>指针多打一位(宽度+1)做回卷标志:空=同步后两指针完全相等;满=前两位相反、其余位相同。</p><p><b>深度计算(经典追问):</b>最坏情况=突发写入量 − 同期读走量。如写入 100 clk × fA,读取 1 data / 2 clk × fB,深度 ≥ 突发数据 − (突发期间读出),再留余量。答公式更要答「最坏同时性假设」。</p>',
  follow:['为什么同步器要两级触发器,一级不行吗(亚稳态概率)?','格雷码 FIFO 深度为什么必须是 2 的幂?'],
  extend:'能主动讲「快时钟域→慢时钟域还要脉冲展宽或握手」是加分项:两级同步器只解决采样亚稳态,不解决「太快信号被漏采」。',
  links:[{t:'FIFO设计与跨时钟域CDC',u:'../10_NPU与数字IC设计/04_FIFO设计与跨时钟域CDC.html'}] },

{ id:'ic-05', s:'ic', lv:4, tags:['CDC','亚稳态'],
  q:'单 bit 信号从一个时钟域到另一个时钟域,怎么处理?多 bit 信号为什么不能直接同步?',
  a:'<p><b>单 bit(慢→快):</b>两级(保守三级)D 触发器同步器。第一级可能进入亚稳态(输出在阈值附近振荡不定),第二级给它一整拍时间恢复到确定电平——亚稳态传播概率随级数指数级下降。代价是 2 拍延迟。</p><p><b>快→慢:</b>信号可能窄于慢域周期被完全漏采。手段:①电平化(翻转寄存器,慢域检测边沿);②脉冲展宽;③握手(req/ack,保证每次传递都被确认)。</p><p><b>多 bit 为什么不行:</b>各位走不同路径、偏斜(skew)不同,同步后可能采到「一半新一半旧」的组合值——这个值可能指向完全错误的语义(如状态机非法态)。正确做法:①格雷码(仅限计数类连续变化);②握手+数据保持稳定期间采样;③异步 FIFO;④多周期路径协议(MCP)。</p>',
  follow:['复位信号跨时钟域怎么处理(异步复位同步释放)?','静态时序分析为什么管不了跨时钟域路径?'],
  links:[{t:'FIFO设计与跨时钟域CDC',u:'../10_NPU与数字IC设计/04_FIFO设计与跨时钟域CDC.html'}] },

{ id:'ic-06', s:'ic', lv:3, tags:['APB','总线'],
  q:'APB 总线的读写时序是怎样的?它为什么适合挂低速外设?',
  a:'<p><b>状态机只有三态:</b>IDLE → SETUP(1 拍:PSELx 拉高、PENABLE 低)→ ACCESS(1 拍:PENABLE 拉高,PREADY 采样)。无等待时每次传输固定 2 拍,所以带宽低——这正是设计取舍:接口极简(无突发/无流水)、门数少、功耗低、易验证,适合 UART/SPI/GPIO/看门狗这类寄存器配置外设。</p><p><b>关键信号:</b>PADDR/PWRITE/PWDATA/PSELx(片选)/PENABLE(使能)/PREADY(从机等待扩展)/PSLVERR(错误响应)。从机可在 ACCESS 拉低 PREADY 插入等待周期。</p><p><b>体系位置(加分):</b>AMBA 家族分层——AXI(高性能 SoC 主干,五通道流水+突发)→ AHB(中速单主)→ APB(慢速外设),通过桥接;NPU 子系统里 NN 核挂 AXI,配置寄存器挂 APB。</p>',
  follow:['APB 的 PSLVERR 在哪个拍采样?读和写都能报错吗?','APB 桥接 AXI 时要处理哪些时钟域与位宽转换?'],
  links:[{t:'APB总线协议与接口设计',u:'../10_NPU与数字IC设计/05_APB总线协议与接口设计.html'}] },

{ id:'ic-07', s:'ic', lv:4, tags:['脉动阵列','NPU'],
  q:'脉动阵列(systolic array)为什么特别适合矩阵乘?代价是什么?',
  a:'<p><b>核心思想:</b>让数据像心脏泵血一样在相邻 PE(处理单元)间「流动复用」——每个权重/部分和只在相邻 PE 间传递,被连续多个周期重复使用,而不是每次都从内存/寄存器堆取。收益:①访存带宽需求大幅下降(数据复用是算力的前提,矩阵乘算访比 O(n));②互连只有最近邻,布线短、时钟频率高、易扩展;③规则结构 → 面积效率高,TPU v1 256×256 脉动阵列是代表。</p><p><b>三种数据流(追问弹药):</b>权重固定(weight stationary,权重留在 PE)适合 CNN 推理;输出固定(output stationary,部分和驻留)累加快;行固定/no delay 介于其间——NPU 项目常用权重固定或输出固定。</p><p><b>代价:</b>填充/排空延迟(阵列越大越明显,小矩阵利用率低)、单一规整计算假设(稀疏/不规则计算利用率差)、固定PE功能灵活性差。</p>',
  follow:['3×3 卷积怎么映射到脉动阵列(im2col 或卷积直接映射)?','稀疏化(剪枝后)的矩阵怎么提高脉动阵列利用率?'],
  links:[{t:'NPU体系结构与脉动阵列',u:'../10_NPU与数字IC设计/07_NPU体系结构与脉动阵列.html'},{t:'NPU项目实战下·运算模块',u:'../10_NPU与数字IC设计/11_NPU项目实战下_运算模块与联调.html'}] },

{ id:'ic-08', s:'ic', lv:4, tags:['量化','INT8'],
  q:'INT8 量化里的 scale 和 zero-point 是什么?对称量化和非对称量化怎么选?',
  a:'<p><b>仿射量化公式:</b>实数 r ≈ scale × (q − zero_point),q 是 INT8。scale 把整数步长映射回浮点步长(动态范围/255);zero_point 把浮点 0 精确对齐到某个整数——ReLU 后大量激活恰为 0、padding 也是 0,零点不对齐会累积巨大卷积偏差,这是非对称量化的存在理由。</p><p><b>对称量化:</b>zero_point=0,范围 [−127,127],硬件乘累加简单、权重常用;非对称:范围 [0,255](uint8),对非负激活(ReLU 后)动态范围利用率高。</p><p><b>粒度(加分):</b>per-tensor(整个张量一个 scale,快但精度损)vs per-channel(每输出通道一个 scale,权重分布差异大时明显更准,是主流方案)。校准方式:训练后量化 PTQ(需要校准集统计分布)与量化感知训练 QAT(训练中模拟量化,精度最好)。</p>',
  follow:['INT8 卷积的偏置为什么常用 INT32 累加?','PTQ 校准一般用多少数据?KL 散度校准在做什么?'],
  links:[{t:'模型量化与端侧部署',u:'../10_NPU与数字IC设计/08_模型量化与端侧部署.html'},{t:'LeNet-5 INT8加速器实战',u:'../10_NPU与数字IC设计/06_深度学习基础与LeNet实战.html'}] },

{ id:'ic-09', s:'ic', lv:4, tags:['AXI','AMBA'],
  q:'AXI 总线有哪五个通道?突发传输和 outstanding 是怎么提升性能的?',
  a:'<p><b>五通道:</b>写地址(AW)、写数据(W)、写响应(B)、读地址(AR)、读数据(R)。地址/数据/响应双向独立、各自 VALID/READY 握手,读写可并行流水。</p><p><b>突发(burst):</b>一次地址携带多拍数据(INCR 递增/FIXED 固定/WRAP 回卷,cache line 填充用 WRAP),省掉逐字寻址的地址开销,配合宽总线把 DDR 效率拉满;NPU 读特征图/权重就是长 INCR burst。</p><p><b>outstanding:</b>主设备可连发多个地址不等数据返回,读写深度乱序执行掩盖延迟;靠 ID 区分不同事务、支持乱序完成——这是 AXI 相比 AHB 的本质增益。</p><p><b>握手规则(常追问):</b>VALID 一旦拉高不得在 READY 前撤销(信息不得依赖 READY);通道间不得死锁(如 AW 先于 W 的依赖关系有明确协议规定)。</p>',
  follow:['AXI 的 WRAP burst 为什么适合 cache line 填充?','AXI4 和 AXI4-Lite/Stream 的差别?'],
  links:[{t:'芯片设计流程与AHB/AXI总线',u:'../10_NPU与数字IC设计/09_芯片设计流程与AHB_AXI总线.html'}] },

{ id:'ic-10', s:'ic', lv:4, tags:['UVM','验证'],
  q:'UVM 里 sequence、sequencer、driver 三者的关系是什么?验证怎么算「做完」?',
  a:'<p><b>激励分层:</b>sequence(业务层,产生事务序列:发什么包/什么顺序)→ sequencer(仲裁,多个 sequence 抢端口时按优先级排)→ driver(引脚层,把事务拆成具体信号时序驱动到接口)。sequence 不接触信号,driver 不懂业务——事务经 seq_item_port 用 get_next_item/item_done 握手传递。</p><p><b>为什么要分层(追问核心):</b>同一套 sequence 可在不同配置/接口速率下复用;virtual sequence 可跨 agent 编排(配置寄存器+发数据+等中断);测试用例只写 sequence,改激励不碰时序代码。</p><p><b>验证收敛标准:</b>①测试计划逐项落实;②功能覆盖率(覆盖组:边界/交叉场景)100% 达标;③代码覆盖率(行/分支/条件/翻转/fsm)达到目标且未覆盖项逐一分析豁免;④断言(SVA)无未解释失败;⑤回归通过且无已知遗留 bug——「覆盖率驱动验证」是行业方法论。</p>',
  follow:['RAL 寄存器模型在 UVM 里解决什么问题(前门/后门访问)?','virtual sequence 和 virtual sequencer 的「virtual」指什么?'],
  extend:'NPU 验证项目加分句:「我的覆盖点是 FIFO 空满边界、AXI 4KB 边界、count=0/count=max 的翻转,以及卷积 1×1/带 padding/跨步>1 的场景交叉」——把覆盖率说到具体边界才算真做过。',
  links:[{t:'SystemVerilog与UVM架构',u:'../10_NPU与数字IC设计/12_SystemVerilog与UVM架构.html'},{t:'NPU验证项目·覆盖率',u:'../10_NPU与数字IC设计/13_NPU验证项目_环境搭建与覆盖率.html'}] },

/* ================= 大模型与具身智能 llm ================= */
{ id:'llm-01', s:'llm', lv:5, tags:['Transformer','注意力'],
  q:'讲一下自注意力机制:Q、K、V 分别是什么?为什么点积要除以 √d_k?',
  a:'<p><b>公式:</b>Attention(Q,K,V) = softmax(QKᵀ/√d_k)·V。每个 token 的查询 Q 与所有 token 的键 K 做点积得相似度分数,softmax 归一成权重后对值 V 加权求和——本质是「按相关性做软寻址的信息聚合」:Q=我在找什么,K=我是什么(索引),V=我携带的信息(内容)。</p><p><b>为什么除以 √d_k(必追问):</b>q·k 是 d_k 个独立分量乘积之和,期望 0、方差 ∝ d_k;维度大时 logits 方差过大,softmax 进入饱和区(接近 one-hot),梯度趋零训练不动。除以 √d_k 把方差归一回 1,维持 softmax 在「工作区」。</p><p><b>多头:</b>把 d_model 切成 h 份各自做注意力再拼接——不同头可分别关注语法/位置/语义等不同子空间,等价于词表示的多视角特征提取。复杂度 O(n²·d)(序列长度平方)是主要瓶颈,催生了 FlashAttention、滑动窗口、线性注意力等优化。</p>',
  follow:['注意力掩码(padding mask 和 causal mask)分别做什么?','FlashAttention 为什么快(显存读写 vs 计算量)?'],
  extend:'面试官常让你推「为什么不能只用 Q=K=V 一个矩阵」:没有三组独立投影,注意力退化为对称相似度聚合,失去「查询什么/提供什么」的非对称表达能力。',
  links:[{t:'大模型基础与MoE架构图解',u:'../09_大模型与具身智能/01_大模型基础与MoE架构图解.html'},{t:'感知与具身智能VLA与世界模型',u:'../06_软件与算法/05_感知与具身智能_VLA与世界模型.html'}] },

{ id:'llm-02', s:'llm', lv:4, tags:['MoE','稀疏激活'],
  q:'MoE(混合专家)是怎么做到「参数多但计算少」的?负载均衡损失是干什么的?',
  a:'<p><b>稀疏激活:</b>把 FFN 层换成 N 个专家 + 一个 router(门控网络);每个 token 只选 top-k(通常 1~2)个专家计算,其余专家不参与——总参数量随 N 增长,但每 token FLOPs 只随 k 增长,实现「容量大、计算省」。DeepSeek-V3 256 个路由专家+1 共享专家,每 token 激活 8 个。</p><p><b>负载均衡辅助损失(必追问):</b>router 若「偏心」个别专家(赢家通吃),其余专家得不到训练逐渐废弃,等于浪费参数还丢了容量。辅助损失惩罚专家间负载方差不均,把各专家期望负载推向均匀;工程上还配容量因子(capacity factor)与 token 丢弃策略、以及训练初期的小噪声帮助探索。DeepSeek 的创新还有:细粒度专家切分+共享专家(通用知识不再重复占用路由专家)。</p><p><b>代价:</b>显存要装下全部专家、多机训练有 all-to-all 通信开销、推理 batch 小时专家利用率低。</p>',
  follow:['MoE 推理时 batch 小(端侧)为什么吃亏?','共享专家和路由专家的分工是什么?'],
  links:[{t:'大模型基础与MoE架构图解',u:'../09_大模型与具身智能/01_大模型基础与MoE架构图解.html'},{t:'DeepSeek架构精讲',u:'../09_大模型与具身智能/02_DeepSeek架构精讲.html'}] },

{ id:'llm-03', s:'llm', lv:5, tags:['RLHF','DPO','后训练'],
  q:'SFT、RLHF、DPO 三者是什么关系?DPO 为什么能省掉奖励模型?',
  a:'<p><b>SFT(监督微调):</b>拿人工标注的高质量问答做下一词预测的模仿学习——教会「格式与能力」,但只能模仿示范,无法表达「哪个回答更好」的偏好,且会放大标注噪声。</p><p><b>RLHF(基于人类反馈的强化学习):</b>三阶段——SFT 起步 → 人类对回答做偏好排序训出奖励模型 RM → 用 PPO 最大化 RM 得分同时用 KL 惩罚约束不偏离 SFT(防 reward hacking 与能力遗忘)。效果最好但工程链路长:RM 会过优化,PPO 训练不稳定、超参敏感、要 4 个模型同时在线(policy/ref/RM/value)。</p><p><b>DPO(直接偏好优化):</b>数学上证明 RLHF 目标存在闭式解,把奖励重参数化进目标函数,直接用「偏好对( chosen/rejected )」做类似分类的稳定训练——省掉 RM 训练与在线 RL,两个模型(SFT+当前)即可。取舍:对数据质量更敏感、离线方法天花板略低;工业界常见 RLHF/DPO 混用或先 DPO 后 RLHF。</p>',
  follow:['RLHF 里的 KL 惩罚项在防什么(reward hacking)?','PPO-clip 的 clip 机制在限制什么?'],
  extend:'加分结构:能按「目标→数据→训练稳定性→工程成本」四轴对比三者,并落到自己项目的选择(如「我只用 DPO 因为单卡训不动 RM」)最可信。',
  links:[{t:'强化学习与后训练',u:'../09_大模型与具身智能/03_强化学习与后训练.html'}] },

{ id:'llm-04', s:'llm', lv:4, tags:['LoRA','微调'],
  q:'LoRA 的原理是什么?为什么它推理时零额外延迟?',
  a:'<p><b>核心假设:</b>微调时权重变化量 ΔW 是低秩的(任务适配不需要全参数自由度)。于是冻结原权重 W(d×d),只训练两个小矩阵 B(d×r)、A(r×d),r≪d(常 4~64),前向 h = Wx + BAx。参数量从 d² 降到 2×d×r——7B 模型可训参数从 70 亿降到千万级,单卡可微调。</p><p><b>零推理延迟的原因(必追问):</b>训练完成后 W′ = W + BA 可直接<b>合并</b>成一个权重矩阵,部署结构与原模型完全一致;对比 adapter(串行插入模块)永远多一层计算。A 用高斯初始化、B 初始化为 0(保证起点 ΔW=0,不破坏预训练能力)。</p><p><b>工程追问:</b>通常只挂在注意力的 W_q/W_v(性价比最高);r 越大容量越大但过拟合风险升;QLoRA 把冻结底座量化到 4bit(NF4)+分页优化器,进一步把 65B 微调压进单卡;多任务可保留多套 LoRA 权重按需切换或合并。</p>',
  follow:['LoRA 该挂在注意力的哪些矩阵上,挂在 FFN 上行不行?','QLoRA 的 NF4 量化为什么对正态分布权重更友好?'],
  links:[{t:'代码实战·部署微调与Agent',u:'../09_大模型与具身智能/05_代码实战_部署微调与Agent.html'}] },

{ id:'llm-05', s:'llm', lv:4, tags:['部署','量化','显存'],
  q:'部署一个 7B 模型,FP16 需要多少显存?怎么把它压到消费级显卡甚至笔记本上?',
  a:'<p><b>显存账(先算再答,这是加分点):</b>7B 参数 FP16 = 7×2 = 14GB 权重;再加 KV cache(随上下文长度线性涨,长文本可到数 GB)与激活/框架开销,实际预留 ≥18~20GB——所以 FP16 的 7B 要 A100/4090 级别。</p><p><b>压缩路线:</b>①权重量化:INT8 约减半、INT4(如 GPTQ/AWQ)7B≈3.5GB,笔记本 4060/纯 CPU 可跑;②KV cache 量化与 paged attention(vLLM 的核心,把 KV 像虚拟内存分页管理,碎片与并发浪费大减);③投机解码(小模型草稿+大模型验证);④更小底座或 MoE 稀疏。CPU/端侧走 llama.cpp 的 gguf + mmap,手机端还有 NPU 专用量化格式。</p><p><b>代价要会讲:</b>INT4 权重对精度有损(困惑度上升,复杂推理/长尾知识下降);吞吐与批处理调度策略强相关(continuous batching)。</p>',
  follow:['KV cache 的大小怎么估算(层数×头数×维度×精度×序列长)?','vLLM 的 PagedAttention 解决了什么碎片问题?'],
  extend:'数量级直觉是面试分水岭:「每参数 2 字节(FP16)/1 字节(INT8)/0.5 字节(INT4)」张口就来,再乘参数量加 KV,基本任何部署题都能现场推。',
  links:[{t:'代码实战·部署微调与Agent',u:'../09_大模型与具身智能/05_代码实战_部署微调与Agent.html'},{t:'模型量化与端侧部署',u:'../10_NPU与数字IC设计/08_模型量化与端侧部署.html'}] },

{ id:'llm-06', s:'llm', lv:4, tags:['VLA','具身智能'],
  q:'VLA(视觉-语言-动作)模型是怎么把「看和说」变成机器人动作的?',
  a:'<p><b>三段结构:</b>①视觉编码器(ViT/ResNet)把图像转 token;②预训练 LLM 做主干,融合语言指令与视觉 token 做推理(继承世界知识与泛化能力);③动作头把 LLM 输出映射为机器人可控动作——两条主流路线:离散动作 token(把连续动作离散成词表,如 RT-2 的 256 bins,动作生成变成「下一词预测」)与扩散/流动作头(连续轨迹生成,精细但慢)。代表:RT-2、OpenVLA、π0。</p><p><b>为什么用 LLM 主干(必追问):</b>免费获得语义理解、任务分解与零样本泛化——「把杯子放到红色方块左边」无需逐任务训练;这是 VLA 相比传统端到端模仿学习的本质增益。</p><p><b>落地难点:</b>推理延迟(LLM 前向几十~几百 ms,控制回路要求高频率)、数据贵(真机遥操作,Open X-Embodiment 就是共享数据集的尝试)、动作精度与安全性(幻觉动作要靠底层安全层兜底)、sim2real 差距。</p>',
  follow:['动作 token 的离散化粒度怎么权衡(过粗/过细)?','VLA 控制频率上不去时,工程上怎么补偿(分层:慢思考+快反射)?'],
  links:[{t:'VLA与世界模型详解',u:'../06_软件与算法/08_视觉语言动作模型VLA与世界模型详解.html'},{t:'感知与具身智能VLA与世界模型',u:'../06_软件与算法/05_感知与具身智能_VLA与世界模型.html'}] },

{ id:'llm-07', s:'llm', lv:3, tags:['世界模型','数据'],
  q:'具身智能为什么需要世界模型?它和「直接端到端学策略」比优势在哪?',
  a:'<p><b>世界模型定义:</b>学一个环境的动力学「下一个状态会怎样」(状态转移+奖励预测),让智能体能在「脑内想象」中 rollout 未来——预测 hence 规划。</p><p><b>对比端到端策略学习(直接观测→动作):</b>①样本效率:真实机器人交互极贵(每小时数据采集/磨损成本高),世界模型可在想象中做 model-based RL(Dreamer 系列把真实交互需求降一个数量级);②可规划:显式预测未来才能做长视野任务分解与反事实推理;③可解释与安全评估:先「脑内试错」,危险动作不过真机;④数据角度:视频/仿真海量无动作标注数据可用于训世界模型,而策略学习必须要有动作标签——这是当前具身智能「数据瓶颈」下世界模型被寄予厚望的根本原因。</p><p><b>难点:</b>长时域预测漂移(误差累积)、物理一致性(接触/摩擦建模)、与策略怎么耦合(世界模型只是模拟器,还要 RL/ MPC 在里面规划)。</p>',
  follow:['Dreamer 系列的「想象中训练」是怎么回传梯度的?','视频生成模型(Sora 类)算世界模型吗?'],
  links:[{t:'感知与具身智能VLA与世界模型',u:'../06_软件与算法/05_感知与具身智能_VLA与世界模型.html'},{t:'具身智能数据集与评测专题',u:'../07_前沿知识库/08_具身智能数据集与评测专题.html'}] },

{ id:'llm-08', s:'llm', lv:4, tags:['Agent','工具调用'],
  q:'大模型 Agent 的基本架构是什么?工具调用的完整闭环是怎么跑通的?',
  a:'<p><b>四大件:</b>①规划(任务分解:ReAct/CoT/计划-执行分离);②记忆(短 context + 长期外存:向量库/RAG);③工具(函数调用 function calling:LLM 输出结构化 JSON 调用请求);④反思与重试(结果校验、错误恢复)。最小闭环:用户指令 → LLM 判断需要工具 → 输出 tool_call(JSON:函数名+参数)→ 运行时解析执行真实函数 → 把结果回填到对话 → LLM 继续推理直到给出最终答案。</p><p><b>工程要点(必追问):</b>tool schema 的描述质量直接决定调用准确率;结果必须作为 tool 角色消息回填(「工具结果忘回填」是最常见的跑飞原因);循环上限与异常兜底(死循环/参数幻觉);并行工具调用与依赖编排。</p><p><b>典型失败模式(加分):</b>参数幻觉(编造不存在的枚举值)、过度调用(简单问题也查工具)、结果误读(把报错当成功)——对应解法:schema 校验+重试、few-shot 示例、结果摘要与断言。</p>',
  follow:['RAG 和微调各自适合注入什么知识?怎么选?','Agent 的多步任务里,怎么做「步数预算」防止死循环?'],
  links:[{t:'代码实战·部署微调与Agent',u:'../09_大模型与具身智能/05_代码实战_部署微调与Agent.html'},{t:'AI Agent 介绍',u:'../08_学习工具/17_AI_Agent介绍.html'}] }
]
};
