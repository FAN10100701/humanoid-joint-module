/* ============================================================
 * en-notes.js — 保研英语面试页点词讲解的第三层(08-16 专用数据源)
 * 与 en-dict.js(单词释义)/en-interview-data.js(内容)配合:
 *   phrases  词组短语:整块识别(如 a lot),不再拆成单词各查各的
 *   grammar  语法用法:功能词(a/the/of/which/would…)怎么用
 *   suffix   后缀规则:-ing/-ed/-s/-ly… 变化规律(自动提示原形)
 *   roots    词根词缀:拆词记忆(university = uni+vers+ity)
 * 弹窗优先级:词组 > 单词释义;语法/词根分区在释义下方追加展示
 * 静默更新文件:改这里不记版本
 * ============================================================ */

window.EN_NOTES = {

  /* ---------------- 词组短语(最长匹配优先,key 全小写) ---------------- */
  phrases: {
    "a lot": {
      d: "很多；非常（可当名词也可当副词）",
      g: "① a lot of + 名词 = 很多（a lot of fun 很多乐趣）；② 不带 of 时修饰动词或形容词：learn a lot there（在那里学到很多）、a lot to learn（还有很多要学）。本页三种用法都出现过。"
    },
    "thank you for": {
      d: "为……而感谢你",
      g: "thank you for + 名词 / doing，点明感谢原因：Thank you for your time.（感谢您的时间）／Thank you for this opportunity.（感谢这个机会）"
    },
    "want to": {
      d: "想要做（某事）",
      g: "want to + 动词原形，表达愿望：I want to do research. 口语里常弱读成 wanna，但书面和面试请写/说完整的 want to。"
    },
    "give up": {
      d: "放弃",
      g: "give up + 名词/doing：give up smoking。never give up = 永不放弃，是展示毅力的面试金句。"
    },
    "again and again": {
      d: "一遍又一遍地，反复",
      g: "同义表达：over and over again。用重复结构强调坚持，比写 many times 更生动。"
    },
    "step by step": {
      d: "一步一步地，循序渐进",
      g: "A by B 结构 = 逐个地：step by step（逐步）、line by line（逐行）、one by one（逐个）。"
    },
    "line by line": {
      d: "逐行地",
      g: "同 step by step 的 A by B 结构，debug 时逐行排查就是 debug the code line by line。"
    },
    "keep learning": {
      d: "坚持学习",
      g: "keep + doing = 持续做某事：keep working hard。同义：keep on doing。"
    },
    "try my best": {
      d: "尽我最大努力",
      g: "try one's best to do sth，one's 随人称变化：try his best / try her best。"
    },
    "be interested in": {
      d: "对……感兴趣",
      g: "interested 是形容词，前面必须带 be：I am interested in…；in 后面接名词或 doing：interested in making robots。"
    },
    "go on studying": {
      d: "继续深造",
      g: "go on + doing = 继续做同一件事；go on to do = 接着做另一件事。go on studying for a PhD = 继续读博。"
    },
    "make progress": {
      d: "取得进步",
      g: "progress 是不可数名词，词尾永远不加 s；「取得很大进步」 = make great progress。"
    },
    "do research": {
      d: "做研究",
      g: "research 不可数：说 do research，不说 do a research；研究方向用 research on…。"
    },
    "let me": {
      d: "让我来……",
      g: "Let me + 动词原形，礼貌地提出自己来做：Let me think.（让我想想）／Let me introduce myself.（让我自我介绍）"
    },
    "introduce myself": {
      d: "自我介绍",
      g: "myself 是反身代词「我自己」；动作回到主语自己时要用 -self：introduce yourself（你）/ himself（他）。"
    },
    "could you": {
      d: "您能……吗（礼貌请求）",
      g: "Could you…? 比 Can you…? 更客气，接动词原形：Could you say that again?（能再说一遍吗）听不清老师问题时的救场句。"
    },
    "what does this word mean": {
      d: "这个单词是什么意思？",
      g: "What does X mean? 是问词义的标准句型。注意 does 后面动词用原形 mean，不是 means。"
    },
    "do you mean": {
      d: "您的意思是……吗",
      g: "用于和老师确认自己理解得对不对：Do you mean my graduate plan? 后面接你听懂的内容，比 Pardon 更显主动。"
    },
    "a little": {
      d: "一点儿，稍微",
      g: "a little + 形容词 = 有点……（a little nervous 有点紧张）；a little + 不可数名词 = 一点……（a little time）。"
    },
    "for a moment": {
      d: "片刻，一会儿",
      g: "for + 时间段 = 持续多久：for a moment / for three days / for two years。"
    },
    "by hand": {
      d: "用手，手工（焊接/制作）",
      g: "by + 方式名词（不加 the）：by hand（手工）/ by bus（乘公交）。表示「用什么办法做成」。"
    },
    "open source": {
      d: "开源（公开源代码）",
      g: "open（开放）+ source（源代码）；加连字符 open-source 作形容词：an open-source website。"
    },
    "come true": {
      d: "（梦想、愿望）实现",
      g: "主语只能是 dream / wish 这类词：My dream came true. 人不能做主语。make this dream come true = 使这个梦想成真。"
    },
    "hard work pays": {
      d: "努力总有回报",
      g: "pay 本义「付钱」，这里引申「值得、有回报」。更常见的完整说法：Hard work pays off.（pays 后加 off）"
    },
    "work hard": {
      d: "努力工作 / 学习",
      g: "work 是动词、hard 是副词修饰它。注意 hard work（两个词都是名词）意思是「辛苦的工作」，词序一换词性就变。"
    },
    "graduate school": {
      d: "研究生院（读研）",
      g: "美式说法，go to graduate school = 读研。graduate 作动词读 /ˈdʒædʒueɪt/，意为「毕业」。"
    },
    "a team of three": {
      d: "三人小队",
      g: "a + 单位词 + of + 数量：a team of three（三人一队）/ a group of five（五人一组）。"
    },
    "every day": {
      d: "每天（表示频率）",
      g: "分开写 every day 是时间副词「每天」；连写 everyday 是形容词「日常的」（everyday life 日常生活）。本页用的是「每天」。"
    },
    "in your free time": {
      d: "在（你的）空闲时间",
      g: "in + 时段表示「在……期间」：in my free time / in the morning。同义：in my spare time。"
    }
  },

  /* ---------------- 语法用法(精确单词) ---------------- */
  grammar: {
    "a": "不定冠词：用在辅音开头的单数可数名词前 = 一个/某一个。规则：第一次提到用 a/an，再提用 the；元音音素开头换 an（an hour）。",
    "an": "不定冠词：用在元音音素开头的单数可数名词前：an actuator / an interview。其余规则同 a。",
    "the": "定冠词：特指双方都知道的东西，或第二次提到的名词（I designed a board. → The board was four layers.）。独一无二的事物也用：the world。",
    "and": "并列连词「和」，连接同类成分：circuits and control；连接两个句子时表示接着说：…and I learned a lot there.",
    "but": "转折连词「但是」：It was hard, but I made it work. 前后意思相反时用，比 always yes 更真实可信。",
    "or": "选择连词「或者」：now or never。否定句里用 or 连接并列项（not big or clean 也不常见，多用于疑问/选择）。",
    "of": "所属介词：A of B = B 的 A：a team of three（三人的一队）、a lot of fun。英语的「的」方向和中文相反，先记短语整体。",
    "to": "超高频：① 不定式标志 to + 动词原形（want to do）；② 介词「到、向」（go to your university）。判断方法：to 后面是动词原形就是①。",
    "for": "介词：为了（thank you for…）、持续多久（for a moment）、对于（for us）。面试感谢语固定用 for 点原因。",
    "in": "介词：在…里（in Wuhan）；+ 年/月/季节；用某种语言（in English）；in + 时段（in my free time）。大地点用 in，小地点用 at。",
    "on": "介词：在…表面上（on the left side）；+ 具体某天；在设备上（My code runs on STM32.）。",
    "at": "介词：在小地点/机构（I study at Wuhan University.）；+ 时刻（at 7 o'clock）；擅长 be good at。",
    "with": "介词：用某种工具（with some tools）；和…一起；带有（a board with four layers = 四层的板）。",
    "from": "介词：来自（come from）；从…（from A to B）；向…学习（learn a lot from the professors）。",
    "by": "介词：通过某种方式（by hand）；相差程度（reduce it by 50%）。by hand 中间不加冠词。",
    "about": "介词：关于（a website about humanoid robots）；大约 = about fifty students。",
    "as": "作为/当…时：As the top student in my major, I… 是「身份 + 主句」的加分开头句式，比 I am the top student 高级且不失简单。",
    "so": "连词「因此」（前因后果）：I love robots, so I study them.；so + 形容词 = 如此……（so hard）。",
    "that": "三用：① 连接从句（I believe that…）② 指示词「那个」③ 指代前文整件事（That is all.）。看到 that 后面跟完整句子，多半是①。",
    "which": "关系词，引导定语从句：指代前面整句或那个物 = 「这件事/它」：…website, which brought my ideas to life.（这个网站让想法落地）。从句紧跟在逗号后是加分写法。",
    "because": "连词「因为」：直接回答 Why…? 的问题。because + 完整句子；英语习惯 because 和 so 只用一个。",
    "if": "连词「如果」：真实条件 If I fail, I will try again.；虚拟语气 If I could join…, I would work hard. 表示假设，语气谦虚、最显语法功底。",
    "when": "连词「当…时候」：When I meet a problem, I check it again and again. 从句可放句首（加逗号）或句尾。",
    "also": "副词「也」：位置在实义动词前、be 动词后：I also like embodied AI. / I am also a student.",
    "besides": "副词/介词「另外」：引出追加的加分项，比 and more 正式：Besides, I made an open-source website.",
    "can": "情态动词「能、会」：后接动词原形，没有人称变化（I can / He can）。否定 can't。",
    "could": "can 的过去式，也是委婉用法：Could you…? 比 can 更礼貌；虚拟句 If I could… 里表示假设。",
    "will": "将来时助动词「将、会」：+ 动词原形，谈计划必备：I will read many papers. 否定 will not = won't。",
    "would": "will 的虚拟/委婉形式：would like to do 比 want to 客气；If I could…, I would… 前后成对出现，表示假设。",
    "should": "情态动词「应该」：+ 动词原形，提建议：You should speak slowly.",
    "do": "助动词：帮实义动词构成疑问/否定（Do you…? / I do not know.）； also 作实义动词「做」：do sports / do research。",
    "does": "do 的第三人称单数：What does this word mean? 注意 does 后面的动词恢复原形（mean 而不是 means）。",
    "did": "do 的过去式：Did you…?；也作实义动词过去式「做了」：I did the software.",
    "is": "be 的第三人称单数现在式：主语是单数（It is / This is / My dream is…）。后面接形容词或名词。",
    "are": "be 的复数现在式：主语是复数或 you（We are a team of three.）。",
    "am": "be 的第一人称单数现在式，只跟 I：I am interested in…。",
    "was": "be 的单数过去式：It was hard. 描述过去的经历/项目。",
    "were": "be 的复数过去式：We were a team of three.",
    "be": "动词「是/存在」的原形。变化：am/is/are 现在时，was/were 过去时，been 完成时。后面接形容词、名词表示「是什么样」。",
    "it": "代词「它」；也常作形式主语：It is a great honor to be here.（真正的主语是后面的 to be here）——这个句型背下来直接用。",
    "he": "他；泛指「任何人」时传统上用 he（He is curious and honest.），想更中立可以说 he or she。",
    "how": "疑问词「怎么、如何」：how + 形容词问程度（How hard is it?）；learn how machines stay stable（学会机器如何保持稳定）。",
    "what": "疑问词「什么」：What are your strengths? 问事物；What does X mean? 问词义。",
    "why": "疑问词「为什么」：回答固定用 Because…。Why do you like robotics? → Because robots can…",
    "very": "副词「很」：只修饰形容词/副词（very good），不能直接修饰动词（不说 very like，要说 like…very much）。",
    "too": "副词：① 太……（过头了，多含贬义）：The gain is too high. ② 也：句尾，前面常加逗号。",
    "much": "很多：修饰不可数名词（much time）；肯定句里更常用 a lot of，much 多见于否定和疑问。",
    "many": "很多：修饰可数复数（many papers / many projects）。口诀：many 可数，much 不可数。",
    "more": "比较级标志：more + 多音节形容词 = 更……；也是 much 的比较级。",
    "not": "否定词：not + 动词/be。完整写法 do not = don't；not only…but also… 不但…而且…。",
    "never": "频率副词「从不」：本身已是否定，不要再加 not：I never give up. 位置在实义动词前。",
    "first": "第一/首先。讲步骤三件套：First… Then… Finally…（首先…接着…最后…），回答 plan 类问题的万能框架。",
    "then": "然后：Step 1 之后用。First… Then… Finally…",
    "finally": "最后：经过过程后的收尾：Finally, I found it and fixed it."
  },

  /* ---------------- 后缀变化规则(自动提示原形) ---------------- */
  suffix: {
    "s": "结尾的 s：① 名词复数（robots 很多机器人）；② 一般现在时第三人称单数（It makes…）。",
    "es": "以 s/x/ch/sh 结尾的词加 es 构成复数或三单（boxes, watches）。",
    "ies": "辅音字母 + y 结尾的词，变 y 为 ies 构成复数（universities）。",
    "ed": "动词过去式/过去分词：表示过去发生；个别 ed 词已形容词化（interested 感兴趣的）。",
    "d": "以 e 结尾的动词只加 d 构成过去式：designed, made。",
    "ing": "动词 ing 形式：① 进行时 be + doing；② 动名词当名词用（learning 学习这件事）。like / enjoy 后面接 doing。",
    "ly": "形容词 + ly = 副词，修饰动词：real → really（真正地），final → finally（最后）。",
    "er": "① 比较级「更…」；② 表示「做…的人/设备」：driver（驱动器）、designer（设计师）。",
    "est": "最高级「最…」，前面通常加 the：the hardest problem（最难的问题）。",
    "tion": "动词变名词的常用后缀，表示「动作/结果」：formation（编队）、action。",
    "ment": "动词变名词后缀：movement（运动）、improvement（改进）。",
    "ful": "名词 + ful = 形容词，「充满…的」：useful（有用的）、careful（小心的）。"
  },

  /* ---------------- 词根词缀(拆词记忆) ---------------- */
  roots: {
    "robot": "捷克语 robota（苦工）→ 1920 年科幻剧造出的词。同根：robotics（机器人学）",
    "robotics": "robot（机器人）+ ics（学科后缀，同 physics 物理学）→ 机器人学",
    "humanoid": "human（人）+ oid（像……的）→ 像人的 → 人形的",
    "university": "uni（一，同 uniform 制服）+ vers（转）+ ity（名词后缀）→ 把万般学问转归一处 → 综合大学",
    "engineering": "engine（引擎，源自'巧匠'）+ ing → 设计引擎的学问 → 工程",
    "technology": "techno（技艺）+ logy（学科，同 biology）→ 工艺之学 → 科技",
    "design": "de（向下）+ sign（记号）→ 在纸上落下记号 → 设计；名词动词同形",
    "circuit": "circu（环，同 circle 圆）+ it → 绕一圈的通路 → 电路",
    "control": "contra（反向核对）+ role（册）→ 古义'对照副本核账' → 掌控 → 控制",
    "major": "maj（大，同 major 多数）+ or → 较大的 → 主修专业；反义 minor（辅修/次要）",
    "contest": "con（共同）+ test（检验）→ 大家一起被检验 → 竞赛",
    "national": "nation（国家）+ al（形容词后缀）→ 全国性的",
    "prize": "与 price 同源（拉丁 pretium 价值）→ 争来的有价值之物 → 奖品",
    "formation": "form（形状）+ ation（名词后缀）→ 成形 → 编队",
    "embodied": "em（使进入）+ body（身体）→ 使有了身体 → 具身的（AI 有了躯体）",
    "honor": "拉丁 honor（荣誉）；美式拼 honor、英式多写 honour",
    "interview": "inter（相互）+ view（看）→ 相互见面看 → 面试/访谈",
    "professor": "pro（公开）+ fess（讲）+ or（人）→ 公开讲学的人 → 教授",
    "drone": "本义'雄蜂'，因嗡嗡声被借指遥控飞行器 → 无人机",
    "website": "web（蛛网 → 互联网）+ site（地点）→ 网站",
    "hardware": "hard（硬）+ ware（器物）→ 硬件（与 software 软件相对）",
    "program": "pro（事先）+ gram（写）→ 事先写好的步骤单 → 程序",
    "algorithm": "源自 9 世纪数学家花拉子米 al-Khwārizmī 的名字 → 算法",
    "sensor": "sens（感觉，同 sense）+ or（设备后缀）→ 感知外界之物 → 传感器",
    "motor": "拉丁 mot（动，同 motion 运动）+ or → 会动的东西 → 电机",
    "voltage": "Volt（伏特，人名）+ age（名词后缀）→ 电压",
    "current": "cur（流，同 occur）→ 流动之物 → 电流；又引申'当前的'",
    "feedback": "feed（喂送）+ back（回）→ 把输出送回去比较 → 反馈",
    "kinematics": "kine（动，同 cinema 电影'动起来的画'）+ matics → 研究运动的学问 → 运动学",
    "simulation": "simul（相同，同 same）+ ation → 做得和真的一样 → 仿真",
    "stable": "st（站立，同 stand）+ able → 站得住的 → 稳定的",
    "stability": "stable 的名词形式 → 稳定性",
    "transfer": "trans（转移）+ fer（携带，同 ferry 渡船）→ 搬运过去 → 传递（函数）",
    "function": "funct（执行）+ ion → 执行的东西 → 功能 → 数学里引申'函数'",
    "integral": "integr（完整，同 integer 整数）→ 求整体的 → 积分（PID 的 I）",
    "derivative": "derive（导出）+ ative → 从原函数导出 → 导数（PID 的 D）",
    "proportional": "proportion（比例）+ al → 成比例的（PID 的 P）",
    "oscillation": "oscill（摆动）+ ation → 来回摆 → 振荡",
    "overshoot": "over（超过）+ shoot（射出）→ 冲过了头 → 超调",
    "gain": "获得之物 → 放大后得到的量 → 增益",
    "phase": "希腊语'显现'→ 月亮的圆缺之相 → 相位",
    "disturbance": "dis（分开搅乱）+ turb（搅动，同 turbine 涡轮）→ 搅乱的东西 → 扰动",
    "actuator": "act（驱动）+ uator（设备后缀）→ 执行器",
    "modeling": "model（模型，原指'做样子的小尺寸件'）+ ing → 建模",
    "embedded": "em（进入）+ bed（床）→ 嵌进床里 → 嵌入式的",
    "firmware": "firm（坚固）+ ware（器物）→ 固化在硬件里的软件 → 固件",
    "driver": "drive（驱动）+ er → 驱动器 / 驱动程序",
    "interrupt": "inter（中间）+ rupt（打破，同 rupture 破裂）→ 从中间打断 → 中断",
    "capacitor": "capacit（容纳，同 capacity 容量）+ or → 容纳电荷的元件 → 电容",
    "resistor": "resist（抵抗）+ or → 抵抗电流的元件 → 电阻",
    "filter": "filt（过滤）+ er → 滤波器",
    "noise": "拉丁 nausea（晕船作呕）→ 令人烦的嘈杂声 → 噪声",
    "signal": "sign（记号）+ al → 信号",
    "supply": "sup（下面）+ ply（填满，同 fill）→ 从下面补足 → 供电/供给",
    "frequency": "frequent（频繁的）+ cy（名词后缀）→ 频繁的程度 → 频率",
    "thesis": "希腊语'放置 → 摆出论点'→ 论文",
    "graduate": "grad（级，同 grade 年级）→ 修完一级级学分 → 毕业",
    "research": "re（反复）+ search（找）→ 反复探究 → 研究",
    "progress": "pro（向前）+ gress（走，同 grade）→ 向前走 → 进步",
    "curious": "cur（关心，同 care）→ 对事情上心 → 好奇的",
    "honest": "与 honor（荣誉）同族 → 正直的、诚实的",
    "nervous": "nerv（神经）+ ous（形容词后缀）→ 神经绷紧的 → 紧张的",
    "confident": "con（完全）+ fid（相信，同 faith 信任）→ 全信自己 → 自信的",
    "opportunity": "ob + port（港口）→ 船到港的时机 → 机会",
    "myself": "my（我的）+ self（自己）→ 反身代词'我自己'",
    "favorite": "拉丁 favere（偏爱）+ ite → 最受偏爱的 → 最喜欢的",
    "strength": "strong（强壮）的名词形式 → 力气；长处。反义 weakness（短处）",
    "weakness": "weak（弱）+ ness（名词后缀）→ 弱点",
    "teamwork": "team（队）+ work（工作）→ 团队协作",
    "automatic": "auto（自己，同 automobile 汽车）+ matic → 自动的",
    "electronics": "electron（电子）+ ics（学科后缀）→ 电子学",
    "mechanical": "mechan（机械，同 machine）+ al（形容词后缀）→ 机械的",
    "useful": "use（用）+ ful（充满…的）→ 有用的",
    "steady": "stead（站稳，同 stand）→ 站得稳的 → 稳定的；steady effort = 持续的投入"
  }
};
