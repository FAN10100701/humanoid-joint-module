/* ============================================================
   人形机器人 3D 解剖知识系统 · 机型配置与参数数据模块
   拆分时间: 2026-08-16 · E4 二次拆分（原 app.module.js 内联数据独立成文件）
   本文件只含纯数据，不含任何 Three.js / DOM 逻辑：
     机型比例、可调参数、配色方案、环境预设、URDF 资源配置、
     部件配色、压缩加载开关、预加载清单、对比布局、拆解词典等。
   由 js/app.module.js 具名 import 引入，导出名与原内联名完全一致，
   因此主逻辑代码引用零改动；改参数/机型只动本文件。
   ============================================================ */

/* 机型比例参数（官方URDF加载失败时的参数化回退模型整体比例） */
export const PROP={x1:{h:0.86,slim:0.92},h1:{h:1.0,slim:1.0},g1:{h:0.78,slim:1.05}};

/* ===== 可调参数（宏定义，便于调试） ===== */
export const LABEL_FONT_SIZE=14;           /* 3D文字标签字号(px) */
export const LABEL_PADDING=6;              /* 标签内边距(px) */
export const LABEL_BG_COLOR='rgba(20,28,42,0.85)'; /* 标签背景色 */
export const LABEL_TEXT_COLOR='#ffffff';   /* 标签文字颜色 */
export const AUTO_ROTATE_SPEED=0.008;      /* 自动旋转速度 */
/* ===== 拟人步态可调参数（关节动画：原地行走演示，全部单位弧度） ===== */
export const GAIT_PERIOD=2.2;      /* 步态周期(秒)：越大走得越慢（2.2≈每步1.1秒，接近自然步频） */
export const GAIT_SMOOTH=0.16;     /* 关节角向目标平滑系数(0~1)：越大动作越利落（0.16 消除发飘感） */
export const GAIT_LEG_AMP=0.42;    /* 髋关节前后摆腿幅度（明显迈步感） */
export const GAIT_KNEE_BASE=0.16;  /* 膝关节基础微屈角：支撑相接近伸直 */
export const GAIT_KNEE_AMP=0.42;   /* 膝关节摆动相附加屈膝幅度（抬脚更清晰） */
export const GAIT_ANKLE_AMP=0.22;  /* 踝关节俯仰补偿幅度（落地缓冲+蹬地） */
export const GAIT_ARM_AMP=0.40;    /* 肩关节前后摆臂幅度（摆臂更有力） */
export const GAIT_ELBOW_BASE=0.25; /* 肘关节基础微屈角：摆臂自然屈肘 */
export const GAIT_ELBOW_AMP=0.18;  /* 肘关节随摆臂屈伸幅度 */
export const GAIT_WAIST_AMP=0.10;  /* 腰部偏航随动幅度（反扭更明显） */
export const GAIT_BOB_AMP=1.8;     /* 躯干上下起伏幅度(场景单位≈4cm)：质心随步态升降，增强真实感 */
export const CAMERA_DEFAULT_DIST=105;      /* 默认相机距离 */

/* ==================== 机身配色方案系统（可切换：原配色/银白/纯白/金属/半透明） ====================
   背景：官方 STL 本身无颜色，分部件配色由 PART_COLORS 系统赋予；默认展示分部件"原配色"
   （加载中即为该配色，不再被整体方案覆盖），银白等单色方案作为可选项 */
export const COLOR_SCHEMES={
  /* 原配色（默认）：恢复各部件初始材质（分部件配色：银白躯干+深灰关节+黑色橡胶手脚） */
  dark:  {name:'原配色(默认)', color:null,     metal:null, rough:null, opacity:1.0,  depthWrite:true },
  /* 银白：明亮哑光银白铝合金，整体提亮 */
  silver:{name:'银白',         color:0xe8ecef, metal:0.65, rough:0.32, opacity:1.0,  depthWrite:true },
  /* 纯白：哑光树脂/3D打印白，几乎无金属反射 */
  white: {name:'纯白',         color:0xffffff, metal:0.05, rough:0.55, opacity:1.0,  depthWrite:true },
  /* 金属：高抛光电镀银，金属度拉满（需环境贴图才能体现光泽） */
  metal: {name:'金属色',       color:0xb8bec6, metal:1.00, rough:0.18, opacity:1.0,  depthWrite:true },
  /* 半透明：教学"幽灵视图"，通透显示内部结构 */
  ghost: {name:'半透明',       color:0xd8e4f0, metal:0.20, rough:0.30, opacity:0.45, depthWrite:false}
};

/* ==================== 环境背景预设系统（程序化生成，零外部下载，切换毫秒级） ====================
   默认"无环境"保持原始透明背景+网格地面；其余预设用 Canvas 渐变天空 + 柔和太阳 + 雾
   + 实体地面 + 灯光色温微调，营造"简单好看、稍微真实"的自然光/展厅氛围 */
/* 环境预设可调参数（调试用宏） */
export const ENV_PRESETS={
  /* 无环境（默认）：透明背景 + 网格地面 + 原五光源，即历史默认观感 */
  none:  {name:'无环境(默认)'},
  /* 晴天自然光：天蓝→暖白渐变 + 太阳光晕 + 草地色地面 + 轻雾 */
  sky:   {name:'晴天自然光', stops:['#5fb2f0','#a8d8f8','#eef4e2'], sun:[0.68,0.16],
          fog:{color:0xdcecf8,near:160,far:520}, ground:0x8faa76, groundRough:0.95,
          keyColor:0xfff2dc, keyInt:1.35, keyPos:[30,42,20], hemiSky:0xbfe0ff, hemiInt:0.7},
  /* 黄昏暖光：橙金→暮紫渐变 + 低角度暖阳 + 暖沙色地面 + 中等雾 */
  sunset:{name:'黄昏暖光', stops:['#f7b26a','#f4845f','#4a3a5e'], sun:[0.3,0.22],
          fog:{color:0xe8b48c,near:140,far:480}, ground:0x9a7f66, groundRough:0.9,
          keyColor:0xffb070, keyInt:1.5, keyPos:[-38,18,12], hemiSky:0xffc9a0, hemiInt:0.55},
  /* 展厅：深灰渐变背景 + 深色地板 + 白光主灯（机器人类产品发布氛围） */
  studio:{name:'展厅', stops:['#3a4048','#23272e','#171a1f'], sun:null,
          fog:{color:0x23272e,near:180,far:560}, ground:0x2c3036, groundRough:0.35,
          keyColor:0xffffff, keyInt:1.6, keyPos:[16,45,26], hemiSky:0x9aa8b8, hemiInt:0.5}
};

/* ================= 机器人构建：官方 URDF+STL 真实模型资源配置（已随页面本地化存放） ================= */
export const URDF_CFG={
  /* H1 使用带灵巧手版 URDF（含左右手 hand_link/hand_base_link/Link11~22 手指关节），补齐手部建模 */
  h1:{urdf:'models/h1/h1_with_hand.urdf',dir:'models/h1'},
  g1:{urdf:'models/g1/g1_29dof.urdf',dir:'models/g1'},
  /* X1 为智元官方开源 URDF（agibot_x1_train 仓库），STL 均已本地化到 models/x1 根目录；
     腰3+双臂12 共15个关节已由 fixed 改造为 revolute，共 27 可动自由度 */
  x1:{urdf:'models/x1/x1.urdf',dir:'models/x1'}
};

/* ==================== 部件配色系统（工业机器人美学配色） ====================
   同类型关节/结构使用统一颜色，左右对称颜色一致 */
export const PART_COLORS = {
  /* 躯干主体：哑光银白铝合金（宇树H1主色） */
  torso:      {hex:0xd4d8dc, metal:0.75, rough:0.35, name:'躯干主体'},
  /* 腰部关节：深灰金属（关节连接处） */
  waist:      {hex:0x8a9099, metal:0.85, rough:0.28, name:'腰部关节'},
  /* 头部：亮银白（头部外壳） */
  head:       {hex:0xc0c5cc, metal:0.80, rough:0.30, name:'头部模组'},
  /* 传感器：深灰/黑色（镜头、雷达罩）带蓝色发光 */
  sensor:     {hex:0x2a3040, metal:0.50, rough:0.40, name:'传感器模组'},
  /* 肩部关节：银色金属关节 */
  shoulder:   {hex:0xb0b6be, metal:0.88, rough:0.25, name:'肩部3DOF关节'},
  /* 肘部关节：银灰金属 */
  elbow:      {hex:0xa0a6ae, metal:0.88, rough:0.25, name:'肘部1DOF关节'},
  /* 腕部关节：银色 */
  wrist:      {hex:0x9a9fa8, metal:0.88, rough:0.25, name:'腕部3DOF关节'},
  /* 手部：黑色柔性橡胶 */
  hand:       {hex:0x1a1d22, metal:0.05, rough:0.90, name:'柔性手部'},
  /* 髋部关节：深银灰（下肢大关节） */
  hip:        {hex:0x9a9fa8, metal:0.85, rough:0.28, name:'髋部3DOF关节'},
  /* 膝关节：银色金属 */
  knee:       {hex:0x8e949c, metal:0.85, rough:0.28, name:'膝部1DOF关节'},
  /* 踝部关节：深灰 */
  ankle:      {hex:0x7e848c, metal:0.85, rough:0.30, name:'踝部2DOF关节'},
  /* 足部：黑色防滑橡胶 */
  foot:       {hex:0x15181c, metal:0.05, rough:0.88, name:'足部'}
};

/* ===== 压缩 STL 智能加载开关（网络提速核心，排查问题时临时关） ===== */
export const DRC_STL_ENABLE=true;  /* Draco(.drc) 优先加载总开关：false 时跳过 .drc 直接走 .gz/.stl */
export const GZ_STL_ENABLE=true;   /* gzip 压缩加载总开关：false 时跳过 .gz 直接走原始 STL */
export const DRC_DECODE_TIMEOUT_MS=15000;  /* Draco解码超时(ms)：解码卡死(wasm/worker异常)时放弃并转入.gz回退，防进度条永久停滞 */

/* 限并发 + 重试 + 失败容忍的STL加载器可调参数 */
export const STL_MAX_RETRY=3;      /* 单个STL加载失败的最大重试次数 */
export const STL_CONCURRENCY=12;   /* 同时加载的STL数量：越大加载越快。GitHub Pages/gitee.io均为HTTP/2多路复用，12安全；若目标服务器为HTTP/1.1建议改回6-8 */
export const STL_RETRY_DELAY=600;  /* 重试间隔基准值(ms)，逐次递增，减少瞬时网络抖动的影响 */

/* 占位几何边长：真实STL下载完成前先用小方盒占位，让整机骨架立刻可见（URDF米为单位，整机约1.8m） */
export const PLACEHOLDER_SIZE=0.08;
/* 整机归一化基准（场景单位）：与 applyUrdf 的几何归一化公式一致 */
export const ROBOT_TARGET_H=85;    /* 整机目标高度 */
export const FLOOR_Y=-54;          /* 地面高度 */

/* ===== 减速器 STL 预加载清单（机器人模型加载完成后后台预取到 HTTP 缓存，进拆解场景秒开） ===== */
export const REDUCER_STL=[
  'models/planetary_cybergear/Back.stl','models/planetary_cybergear/CareerReception.stl',
  'models/planetary_cybergear/Front.stl','models/planetary_cybergear/InputShaft.stl',
  'models/planetary_cybergear/OutputShaft.stl','models/planetary_cybergear/PlanetGear.stl',
  'models/planetary_cybergear/RingGear.stl','models/planetary_cybergear/SunGear.stl',
  'models/harmonic_htm/CircularSpline.STL','models/harmonic_htm/Coupler.STL',
  'models/harmonic_htm/FlexSpline.STL','models/harmonic_htm/Housing.STL',
  'models/harmonic_htm/HousingBottom.STL','models/harmonic_htm/InputShaft.STL',
  'models/harmonic_htm/MotorMount.STL','models/harmonic_htm/OutputShaft.STL',
  'models/harmonic_htm/SupportShaft.STL','models/harmonic_htm/WaveGenerator.STL',
  'models/cycloidal_htm/BaseHousing.STL','models/cycloidal_htm/CycloidalDisk.STL',
  'models/cycloidal_htm/DistanceRing2.STL','models/cycloidal_htm/DistanceRing3.STL',
  'models/cycloidal_htm/EccentricShaft.STL','models/cycloidal_htm/HousingLid.STL',
  'models/cycloidal_htm/InputShaft.STL','models/cycloidal_htm/MotorMount.STL',
  'models/cycloidal_htm/OutputShaft.STL','models/cycloidal_htm/RollerBushingRing.STL'
];

/* 三机同屏机型预加载延迟(ms)：排在减速器预载(约2.5s后)之后开始，避免抢首屏带宽 */
export const PRELOAD_ROBOTS_DELAY=9000;

/* ===== 三机同屏对比布局参数 ===== */
export const CMP_ORDER=['h1','g1','x1'];  /* 左→右排列顺序（按身高 1.80 / 1.32 / 1.30 从高到低） */
export const CMP_NAMES={x1:'X1(~1.30m)',h1:'H1(~1.80m)',g1:'G1(~1.32m)'};  /* 各机对比标签 */
export const CMP_GAP=32;             /* 相邻机型水平间距(场景单位)：H1 在 -CMP_GAP，G1 居中，X1 在 +CMP_GAP */

/* 顺序拆解动画可调参数（调试用宏） */
export const TD_SEQ_STEP=0.022;      /* 每帧推进的顺序动画进度（零件个/帧），0.022≈每零件0.75秒@60fps */
export const TD_SEQ_HOLD=1.6;        /* 全部拆出后停顿时长（零件个单位），便于观察完整爆炸态 */

/* 拆解零件详解词典：id -> {n:名称, p:教学说明} */
export const TD_INFO={
  j_flange:{n:'输出法兰',p:'连接机械臂/腿杆的对外输出接口，把减速器的低速大扭矩输出传递出去。通常带止口定位+螺栓孔圈，与交叉滚子轴承外圈紧固。'},
  j_bearing:{n:'交叉滚子轴承',p:'关节主轴承。滚子呈 90° 交叉排列，单个轴承即可同时承受径向力、轴向力和倾覆力矩，替代传统双轴承方案，大幅缩短轴向尺寸。'},
  j_cs:{n:'刚轮 Circular Spline（真实开源件）',p:'谐波减速器的刚性内齿圈，固定于壳体，齿数比柔轮多 2 个。本零件来自 howtomechatronics 开源 SolidWorks 模型的真实 STL。'},
  j_fs:{n:'柔轮 Flexspline（真实开源件）',p:'薄壁杯形弹性外齿轮，即关节输出端。每转一圈反复弹性变形，疲劳寿命是谐波的核心指标。本零件来自 howtomechatronics 开源模型。'},
  j_wg:{n:'波发生器 Wave Generator（真实开源件）',p:'椭圆凸轮+柔性轴承，装在电机高速轴上，把柔轮撑成椭圆并与刚轮啮合。本零件来自 howtomechatronics 开源模型。'},
  j_enc_out:{n:'输出端编码器',p:'直接测量关节真实输出角（绝对式），从根源上消除谐波减速器背隙带来的角度误差，是双编码器关节设计的关键一环。'},
  j_rotor:{n:'电机转子',p:'永磁体阵列（表贴/Halbach），无框设计直接压入壳体。与定子共同产生扭矩，是关节的动力源。'},
  j_stator:{n:'电机定子',p:'绕组铁芯，关节发热的主要来源。需灌封导热处理，并埋 NTC 热敏电阻监测温度，防止磁钢过热退磁。'},
  j_enc_mot:{n:'电机端编码器',p:'装在电机高速轴上，为 FOC 提供换相信号，同时作为速度环反馈。分辨率通常 14~19 位。'},
  j_pcb:{n:'FOC 驱动板',p:'集成 MCU + 栅极驱动 + MOSFET + 电流采样 + CAN/RS485 通信的驱控一体电路板，紧贴电机安装，执行三环控制算法。'},
  h_output:{n:'输出轴（真实开源件）',p:'谐波减速器低速输出端，与柔轮杯底相连。来自 howtomechatronics R25 开源 SolidWorks 模型。'},
  h_base:{n:'外壳底盖（真实开源件）',p:'封闭减速器输出侧，支撑柔轮杯底并固定输出轴。来自 howtomechatronics R25 开源模型。'},
  h_fs:{n:'柔轮 Flexspline（真实开源件）',p:'薄壁开口杯形弹性外齿轮(50齿)，杯底为输出端，开口端外齿与刚轮内齿啮合。它是疲劳寿命的决定性零件。'},
  h_wg:{n:'波发生器 Wave Generator（真实开源件）',p:'椭圆凸轮，把柔轮撑成椭圆与刚轮啮合。输入每转一圈，柔轮与刚轮错开 2 个齿，实现 i=齿数/2=25:1。'},
  h_cs:{n:'刚轮 Circular Spline（真实开源件）',p:'刚性内齿圈(52齿)，固定于壳体，齿数比柔轮多 2。拆解时重点对比内齿与柔轮外齿的齿形差异。'},
  h_support:{n:'波发生器支撑轴（真实开源件）',p:'支撑波发生器并连接输入轴，把电机高速旋转传递给椭圆凸轮。'},
  h_housing:{n:'壳体（真实开源件）',p:'谐波减速器主壳体(外径95mm)，容纳刚轮并承受反扭矩。'},
  h_input:{n:'输入轴（真实开源件）',p:'连接电机与波发生器的高速输入端。'},
  h_coupler:{n:'6mm 联轴器（真实开源件）',p:'连接电机轴与输入轴的 6mm 轴孔联轴器。'},
  h_motor:{n:'电机安装座（真实开源件）',p:'NEMA17 步进电机安装座，把电机固定到减速器输入侧。'},
  p_back:{n:'后盖（真实开源件）',p:'CyberGear 行星减速箱的后盖，封闭齿轮腔并承受反扭矩。来自专为小米 CyberGear（人形机器人关节电机）设计的开源 SolidWorks 装配体。'},
  p_ring:{n:'内齿圈/外壳（真实开源件）',p:'外圈内齿，通常固定不转，是行星传动比公式 i = 1 + Z圈/Z阳 的分母。CyberGear 采用 3.5:1 单级减速。'},
  p_planet:{n:'行星轮 ×6（真实开源件）',p:'六个行星轮绕太阳轮每 60° 均布，既自转又公转，把载荷均分到多条啮合路径，抗冲击、噪声低。'},
  p_sun:{n:'太阳轮（真实开源件）',p:'中心输入齿轮，接电机高速轴。CyberGear 电机端经太阳轮驱动行星轮组。'},
  p_carrier:{n:'行星架止转环（真实开源件）',p:'承载行星轮并与输出轴相连，把行星轮的公转转化为输出的低速大扭矩。'},
  p_output:{n:'输出轴（真实开源件）',p:'行星减速器的低速大扭矩输出端，连接机器人关节。'},
  p_input:{n:'输入轴（真实开源件）',p:'连接电机与太阳轮的高速输入端。'},
  p_front:{n:'前盖（真实开源件）',p:'减速箱前盖，与后盖共同封闭齿轮腔。'},
  c_output:{n:'输出轴（真实开源件）',p:'摆线减速器低速输出端，带输出销把摆线盘公转转化为输出。来自 howtomechatronics R25 开源 SolidWorks 模型。'},
  c_base:{n:'基座外壳（真实开源件）',p:'内壁均布 26 个滚柱针齿的外壳，是摆线减速器的固定齿圈。'},
  c_disk:{n:'摆线盘（真实开源件）',p:'外廓为摆线曲线的核心传动件，齿数=针齿数−1。偏心轴每转一圈，摆线盘反向转过一个针齿角度，实现 25:1 减速。'},
  c_rollers:{n:'滚柱衬套隔环（真实开源件）',p:'定位 26 个滚柱针齿的隔环，保证针齿在壳体内等距分布。'},
  c_lid:{n:'外壳盖（真实开源件）',p:'封闭减速器输入侧，支撑输入轴与偏心轴。'},
  c_ecc:{n:'偏心轴（真实开源件）',p:'带偏心凸轮的曲柄输入轴，偏心量 e 驱动摆线盘摆动。注意观察轴上的偏心凸轮——这是摆线传动的核心几何。'},
  c_input:{n:'输入轴（真实开源件）',p:'连接电机与偏心轴的高速输入端。'},
  c_ring2:{n:'隔环 2（真实开源件）',p:'装配在轴上的定位隔环，保证轴向间隙。'},
  c_ring3:{n:'隔环 3（真实开源件）',p:'装配在轴上的定位隔环，保证轴向间隙。'},
  c_motor:{n:'电机安装座（真实开源件）',p:'NEMA17 步进电机安装座，把电机固定到减速器输入侧。'},
  pf_flange:{n:'输出法兰',p:'PF86 对外输出接口（86mm 法兰标准），连接腿杆/臂杆。带止口定位+螺栓孔圈，中空结构让线缆从轴心穿过（中空走线）。'},
  pf_output:{n:'行星输出轴（真实开源件）',p:'行星架低速输出端，把行星轮公转汇聚成低速大扭矩输出。来自专为小米 CyberGear 人形关节设计的开源装配体（同为 QDD 准直驱方案）。'},
  pf_bearing:{n:'角接触轴承',p:'QDD 关节主轴承。低减速比意味着电机会"感受"到外部冲击，轴承需承受径向+轴向复合载荷；中空内径走线。'},
  pf_planet:{n:'行星轮 ×6（真实开源件）',p:'六个行星轮每 60° 均布，把载荷均分到多条啮合路径——QDD 关节抗冲击能力的关键。QDD 减速比低（约 10:1），单级即可，无多级背隙累积。'},
  pf_carrier:{n:'行星架止转环（真实开源件）',p:'承载行星轮销轴并连接输出轴。QDD 低速端扭矩仍达数百 Nm，行星架是刚性最敏感零件。'},
  pf_sun:{n:'太阳轮（真实开源件）',p:'中心输入齿轮，直接压在电机轴上。减速比 i = 1 + Z圈/Z阳，太阳轮齿数决定减速比。'},
  pf_ring:{n:'内齿圈/外壳（真实开源件）',p:'固定内齿圈，与关节壳体一体。QDD 关节的内齿圈常作为外壳主体，缩短轴向尺寸。'},
  pf_rotor:{n:'外转子（环形磁钢）',p:'外转子无框力矩电机的转子：大直径环形磁钢阵列，"又大又扁"是 QDD 的标志——电机本体的扭矩 ∝ 半径²，大直径弥补低减速比的扭矩损失。'},
  pf_stator:{n:'定子（绕组铁芯）',p:'绕组铁芯位于转子内侧，灌封导热胶后紧贴壳体散热。QDD 关节持续电流大，定子温升直接决定持续扭矩。'},
  pf_enc_out:{n:'输出端编码器（绝对值）',p:'直测关节真实输出角，绝对式——上电即知关节位置，无需回零。低减速比背隙小，但输出端编码器仍能消除残余背隙误差。'},
  pf_enc_mot:{n:'电机端编码器',p:'高速端增量式编码器，为 FOC 提供换相信号 + 速度环反馈。与输出端编码器构成双编码器架构。'},
  pf_pcb:{n:'PF-Link 驱控板',p:'驱控一体板：MCU + 栅驱 + MOSFET + 电流采样，集成 PF-Link 智能接口——智元自定义的关节总线，单线级联供电+通信，简化整机布线。'}
};

/* ===== 行星减速器：CyberGear 单级行星齿轮箱（真实开源 SolidWorks 模型）可调参数 ===== */
export const CYBER_ORBIT=21;        /* 行星轮公转半径(mm)：6 个行星轮绕太阳轮均布的中心距 */

/* ===== 谐波/摆线减速器同轴装配可调参数（调试用宏） ===== */
export const TD_LBL_X=55;        /* 零件文字标签的 X 偏移(mm)：须大于最大零件半径(约47.5)，让标签落在零件外侧 */
