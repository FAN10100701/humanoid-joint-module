/* ============================================================
 * en-interview-data.js — 保研英语面试页全部内容(08-16 专用数据源)
 * 基于简历：范佳豪 · 武汉科技大学 · 机器人工程 · 排名 1/50
 * 原则：句子短、词简单，说得少、说得对
 * 想改内容只改这个文件；供 16_保研英语面试.html 懒加载,
 * 暴露 window.EN_DATA = { intro, qa, rescue, vocab, tips }
 * ============================================================ */

window.EN_DATA = {

  /* ---------------- 1. 自我介绍 ---------------- */
  intro: [
    {
      id: "intro-30",
      name: "⏱ 30秒极简版（约75词）",
      tip: "英语没把握就用这版。句子之间用 As / Outside / which 串联，背的时候按「问候 → 自我 → 学业 → 项目 → 愿望」五段记，不用逐句死记。问候语按面试时间选：上午 Good morning, professors. ／ 下午 Good afternoon, professors. ／ 拿不准就用 Hello，任何时候都不会错。学有余力可在结尾感谢前加一句奖项：I won a second prize in the National Electronic Design Contest.（全国电赛省赛二等奖）",
      lines: [
        { en: "Hello, professors.",                        zh: "各位老师好。" },
        { en: "It is a great honor to be here.",           zh: "非常荣幸能来到这里。" },
        { en: "My name is Fan Jiahao, a Robot Engineering student at Wuhan University of Science and Technology.", zh: "我是武汉科技大学机器人工程专业的范佳豪。" },
        { en: "As the top student in my major, I have a solid foundation in circuits and control.", zh: "作为专业第一，我在电路和控制方面基础扎实。" },
        { en: "Outside class, I designed a drone motor board and a robot learning website, which brought my ideas to life.", zh: "课余时间我设计了无人机电调板，还做了一个机器人学习网站，把想法变成了现实。" },
        { en: "In the future, I hope to study humanoid robots at your university.", zh: "希望将来能在贵校研究人形机器人。" },
        { en: "That is all. Thank you.",                   zh: "我说完了，谢谢大家。" }
      ]
    },
    {
      id: "intro-60",
      name: "⏱ 60秒标准版（约145词）",
      tip: "有一定把握后再背这版，信息更全：排名 + 电赛奖 + 三个项目 + 研究方向。整版用从句串成一条线（Because / which / To understand / Working with / If），按「问候 → 学业 → 项目 → 梦想」四段背，每段记住第一句就能带出后面。问候语按时间换：上午 Good morning ／ 下午 Good afternoon ／ 傍晚 Good evening，拿不准就保持 Hello。",
      lines: [
        { en: "Hello, professors. It is a great honor to be here.", zh: "各位老师好，非常荣幸能来到这里。" },
        { en: "My name is Fan Jiahao, a Robot Engineering major at Wuhan University of Science and Technology.", zh: "我是武汉科技大学机器人工程专业的范佳豪。" },
        { en: "Out of fifty students, I rank first in my major, which comes from steady effort.", zh: "在专业 50 名学生中，我排名第一，这来自于持续的投入。" },
        { en: "Because I love turning ideas into real machines, I spend much spare time on hands-on projects.", zh: "因为喜欢把想法变成真正的机器，我把很多课余时间花在动手项目上。" },
        { en: "In the National Electronic Design Contest, I won a second prize, which strengthened my hardware skills.", zh: "在全国大学生电子设计竞赛中，我获得了省赛二等奖，硬件能力也更扎实了。" },
        { en: "To understand how drones really fly, I designed a four-layer circuit board for a drone.", zh: "为了弄懂无人机到底怎么飞，我为它设计了一块四层电路板。" },
        { en: "Working with ROS, I also built a multi-robot formation system.", zh: "在使用 ROS 的过程中，我还搭建了多机器人编队系统。" },
        { en: "Besides, I made an open-source website about humanoid robots.", zh: "另外，我还做了一个关于人形机器人的开源网站。" },
        { en: "My dream is to study humanoid robots and embodied AI, because I believe they will change the world.", zh: "我的梦想是研究人形机器人与具身智能，因为我相信它们会改变世界。" },
        { en: "If I could join your university, I would work hard to make this dream come true.", zh: "如果能加入贵校，我会为实现这个梦想而全力以赴。" },
        { en: "That is all. Thank you very much.",         zh: "我说完了，非常感谢。" }
      ]
    }
  ],

  /* ---------------- 2. 高频问答 ---------------- */
  qa: [
    {
      q: "Why do you like robotics?",
      qZh: "你为什么喜欢机器人？",
      tip: "思路：机器人有用 + 自己爱动手。两句就够。",
      lines: [
        { en: "Because robots can help people do hard jobs.", zh: "因为机器人能帮人干困难的活。" },
        { en: "I enjoy making things with my own hands.",    zh: "我喜欢亲手做东西。" },
        { en: "Robots bring me a lot of fun.",               zh: "机器人带给我很多乐趣。" }
      ]
    },
    {
      q: "Please introduce your university.",
      qZh: "请介绍一下你的大学。",
      tip: "思路：校名 + 地点 + 一句好话。不要背校史，说多了容易错。",
      lines: [
        { en: "I study at Wuhan University of Science and Technology.", zh: "我在武汉科技大学读书。" },
        { en: "It is in Wuhan, Hubei Province.",              zh: "它位于湖北省武汉市。" },
        { en: "It is a good university, and I learned a lot there.", zh: "它是一所好大学，我在那里学到很多。" }
      ]
    },
    {
      q: "Can you talk about your favorite project?",
      qZh: "谈谈你最喜欢的项目？",
      tip: "思路：项目名（电调板）+ 我做了什么 + 结果。老师大概率追问，引导到你最熟的项目上。如果你报的方向偏 AI/具身智能，就换成人形机器人网站：My favorite project is a humanoid robot website. / I built it and made it open source. / Many people can learn from it.",
      lines: [
        { en: "My favorite project is a drone motor board.",  zh: "我最喜欢的项目是无人机电调板。" },
        { en: "I designed the circuit and wrote the program.", zh: "我设计了电路，编写了程序。" },
        { en: "It was hard, but I made it work.",             zh: "它很难，但我最终让它跑起来了。" }
      ]
    },
    {
      q: "What are your strengths?",
      qZh: "你的优点是什么？",
      tip: "思路：坚持 + 动手。别用 big word，简单词反而显得真诚。",
      lines: [
        { en: "I never give up.",                             zh: "我从不放弃。" },
        { en: "When I meet a problem, I check it again and again.", zh: "遇到问题时，我会一遍遍排查。" },
        { en: "I also learn new things fast.",                zh: "我学新东西也很快。" }
      ]
    },
    {
      q: "What are your weaknesses?",
      qZh: "你的缺点是什么？",
      tip: "思路：主动承认口语弱（老师反正听得出来）+ 我正在补。诚实反而加分。",
      lines: [
        { en: "My spoken English is not good.",               zh: "我的英语口语不好。" },
        { en: "But I read English documents every day.",      zh: "但我每天读英文文档。" },
        { en: "I am sure I will make progress.",              zh: "我一定会进步的。" }
      ]
    },
    {
      q: "Why do you choose our university?",
      qZh: "你为什么选择我们学校？",
      tip: "思路：贵校机器人强 + 想做研究。通用版，任何学校都能说。",
      lines: [
        { en: "Your university is strong in robotics.",       zh: "贵校在机器人领域很强。" },
        { en: "I want to do research here.",                  zh: "我想在这里做研究。" },
        { en: "I believe I can learn a lot from the professors.", zh: "我相信能从各位老师身上学到很多。" }
      ]
    },
    {
      q: "What is your plan for graduate study?",
      qZh: "你的研究生规划是什么？",
      tip: "思路：读论文 → 做实验 → 出成果。三步，每步一句。",
      lines: [
        { en: "First, I will read many papers.",              zh: "首先，我会读很多论文。" },
        { en: "Then, I will do experiments step by step.",    zh: "然后，我会一步步做实验。" },
        { en: "I hope to publish good results.",              zh: "我希望能发表好成果。" }
      ]
    },
    {
      q: "What do you do in your free time?",
      qZh: "你课余时间做什么？",
      tip: "思路：还是围绕动手做东西 + 运动（显得身心健康）。",
      lines: [
        { en: "I like making small things, like circuit boards.", zh: "我喜欢做小东西，比如电路板。" },
        { en: "I also update my robot website.",             zh: "我也会更新我的机器人网站。" },
        { en: "Sometimes I do sports.",                      zh: "有时我运动。" }
      ]
    },
    {
      q: "Why did you learn Japanese, not English?",
      qZh: "你为什么学日语而不是英语？（日语考生必被问）",
      tip: "思路：高中开始学的（客观原因）+ 现在天天用英语读文档（证明能力）。千万不要抱怨英语难。",
      lines: [
        { en: "I started Japanese in high school.",           zh: "我从高中开始学日语。" },
        { en: "Now I use English every day in my study.",     zh: "现在我学习中每天都用英语。" },
        { en: "I can read English datasheets and papers with some tools.", zh: "我能借助工具读英文手册和论文。" }
      ]
    },
    {
      q: "Do you have any questions for us?",
      qZh: "你有什么想问我们的吗？（面试结尾常问）",
      tip: "思路：英语弱就别硬问了，礼貌收尾就是满分答案。",
      lines: [
        { en: "No, thank you.",                               zh: "没有了，谢谢。" },
        { en: "Thank you for your time.",                     zh: "感谢各位老师的时间。" }
      ]
    },
    {
      q: "Please introduce your hometown.",
      qZh: "介绍一下你的家乡。（全网最高频之一）",
      tip: "思路：美 + 安静 + 吃的。三句完事，别报菜名。",
      lines: [
        { en: "My hometown is a beautiful city.",             zh: "我的家乡是一座美丽的城市。" },
        { en: "It is not big, but it is quiet and clean.",    zh: "它不大，但安静又干净。" },
        { en: "The food there is very good.",                 zh: "那里的食物非常好。" }
      ]
    },
    {
      q: "What is your favorite course?",
      qZh: "你最喜欢的课程是什么？",
      tip: "思路：答自动控制原理，正好呼应你的机器人项目，老师会顺着问你会的东西。",
      lines: [
        { en: "My favorite course is Automatic Control.",     zh: "我最喜欢的课程是自动控制原理。" },
        { en: "It teaches me how machines stay stable.",      zh: "它教我机器如何保持稳定。" },
        { en: "I use it in my robot projects.",               zh: "我在机器人项目里用到它。" }
      ]
    },
    {
      q: "What was the hardest problem in your projects?",
      qZh: "项目中遇到的最大困难是什么？",
      tip: "思路：电路噪声（真实经历）→ 反复查 → 解决。体现排查能力。",
      lines: [
        { en: "The hardest problem was noise in my circuit.", zh: "最难的问题是电路里的噪声。" },
        { en: "I checked the board again and again.",         zh: "我一遍又一遍地检查电路板。" },
        { en: "Finally, I found it and fixed it.",            zh: "最后我找到了问题并解决了它。" }
      ]
    },
    {
      q: "Do you like teamwork?",
      qZh: "你喜欢团队合作吗？",
      tip: "思路：喜欢 + 电赛三人分工。把「团队角色」说清楚最加分。",
      lines: [
        { en: "Yes, I like teamwork.",                        zh: "是的，我喜欢团队合作。" },
        { en: "We were a team of three in the electronic contest.", zh: "电子竞赛中我们是三人团队。" },
        { en: "I did the software, and my teammates did the hardware.", zh: "我做软件，队友做硬件。" }
      ]
    },
    {
      q: "What will you do if you fail this interview?",
      qZh: "如果这次面试没通过，你会怎么办？（经典压力题）",
      tip: "思路：不放弃 + 继续努力。千万别表现出沮丧或抱怨。",
      lines: [
        { en: "I will not give up.",                          zh: "我不会放弃。" },
        { en: "I will keep learning and try again.",          zh: "我会继续学习，再试一次。" },
        { en: "I believe hard work pays.",                    zh: "我相信努力终有回报。" }
      ]
    },
    {
      q: "What are your research interests?",
      qZh: "你的研究兴趣是什么？",
      tip: "思路：人形机器人 + 具身智能 + 我已经动手做了网站。三句都是真话。",
      lines: [
        { en: "I am interested in humanoid robots.",          zh: "我对人形机器人感兴趣。" },
        { en: "I also like embodied AI.",                     zh: "我也喜欢具身智能。" },
        { en: "I built a website to learn them.",             zh: "我建了一个网站来学习它们。" }
      ]
    },
    {
      q: "What is your plan after graduation?",
      qZh: "研究生毕业后有什么打算？",
      tip: "思路：机器人工程师 + 可能读博。展示长期投入的意愿。",
      lines: [
        { en: "I want to be a robot engineer.",               zh: "我想成为一名机器人工程师。" },
        { en: "Maybe I will go on studying for a PhD.",       zh: "也许我会继续读博士。" },
        { en: "I will keep working hard.",                    zh: "我会一直努力。" }
      ]
    },
    {
      q: "What makes a good graduate student?",
      qZh: "一名好的研究生应该具备什么素质？",
      tip: "思路：努力 + 好奇 + 诚实，都是简单词，但正好是导师最想听的。",
      lines: [
        { en: "A good student works hard.",                   zh: "好学生要努力。" },
        { en: "He is curious and honest.",                    zh: "他有好奇心而且诚实。" },
        { en: "I will try my best to be one.",                zh: "我会尽力成为这样的人。" }
      ]
    },
    {
      q: "What do you think of AI?",
      qZh: "你怎么看人工智能？（观点题，联系你的方向答）",
      tip: "思路：改变生活 + 有用 + 我要用它做机器人。观点题不需要深刻，需要流畅。",
      lines: [
        { en: "AI is changing our life.",                     zh: "人工智能正在改变我们的生活。" },
        { en: "It is very useful.",                           zh: "它非常有用。" },
        { en: "I want to make robots smarter with AI.",       zh: "我想用人工智能让机器人更聪明。" }
      ]
    },
    {
      q: "How do you feel about your college life?",
      qZh: "你如何评价你的大学生活？",
      tip: "思路：充实 + 成绩和项目（唯一可以炫耀的地方）+ 保持谦虚。",
      lines: [
        { en: "My college life is full and happy.",           zh: "我的大学生活充实而快乐。" },
        { en: "I got a high GPA and made many projects.",     zh: "我取得了高绩点，做了很多项目。" },
        { en: "But I still have a lot to learn.",             zh: "但我还有很多要学的。" }
      ]
    }
  ],

  /* ---------------- 3. 救场金句 ---------------- */
  rescue: [
    { scene: "没听清问题",          en: "Sorry, could you say that again?",        zh: "抱歉，您能再说一遍吗？" },
    { scene: "对方说得太快",        en: "Sorry, could you speak slowly?",          zh: "抱歉，您能说慢一点吗？" },
    { scene: "没听懂某个词",        en: "Sorry, what does this word mean?",        zh: "抱歉，这个词是什么意思？" },
    { scene: "需要时间想（拖时间）", en: "That is a good question. Let me think for a moment.", zh: "这个问题很好。让我想一下。" },
    { scene: "确认自己理解对不对",   en: "Do you mean my graduate plan?",           zh: "您是指我的读研规划吗？" },
    { scene: "太紧张，坦白一下",     en: "Sorry, I am a little nervous.",           zh: "抱歉，我有点紧张。" },
    { scene: "实在不会，诚恳认输",   en: "Sorry, I do not know much about it. I will learn it after the interview.", zh: "抱歉，这个我不太了解。面试后我会去学习。" },
    { scene: "回答完毕的收尾信号",   en: "That is all. Thank you.",                 zh: "我说完了，谢谢。" }
  ],

  /* ---------------- 4. 专业词汇（6组） ---------------- */
  vocab: [
    {
      name: "🤖 机器人方向",
      words: [
        { w: "robot",        ipa: "/ˈroʊbɑːt/",        zh: "机器人",            ex: "This is a robot.",           exZh: "这是一台机器人。" },
        { w: "robotics",     ipa: "/roʊˈbɑːtɪks/",     zh: "机器人学",          ex: "I study robotics.",          exZh: "我学机器人学。" },
        { w: "humanoid robot", ipa: "/ˈhjuːmənɔɪd/",   zh: "人形机器人",        ex: "I like humanoid robots.",    exZh: "我喜欢人形机器人。" },
        { w: "embodied AI",  ipa: "/ɪmˈbɑːdid/",       zh: "具身智能",          ex: "Embodied AI is my dream.",   exZh: "具身智能是我的梦想。" },
        { w: "sensor",       ipa: "/ˈsensər/",         zh: "传感器",            ex: "A sensor can feel the world.", exZh: "传感器能感知世界。" },
        { w: "motor",        ipa: "/ˈmoʊtər/",         zh: "电机、马达",        ex: "The motor makes the robot move.", exZh: "电机让机器人动起来。" },
        { w: "control",      ipa: "/kənˈtroʊl/",       zh: "控制",              ex: "I design the control system.", exZh: "我设计控制系统。" },
        { w: "kinematics",   ipa: "/ˌkɪnəˈmætɪks/",    zh: "运动学",            ex: "Kinematics is about robot motion.", exZh: "运动学研究机器人运动。" },
        { w: "algorithm",    ipa: "/ˈælɡərɪðəm/",      zh: "算法",              ex: "This algorithm is fast.",    exZh: "这个算法很快。" },
        { w: "simulation",   ipa: "/ˌsɪmjuˈleɪʃn/",    zh: "仿真",              ex: "I do robot simulation.",     exZh: "我做机器人仿真。" },
        { w: "ROS",          ipa: "/rɑːt/",            zh: "机器人操作系统",     ex: "I use ROS every day.",       exZh: "我每天都在用ROS。" },
        { w: "formation",    ipa: "/fɔːrˈmeɪʃn/",      zh: "编队",              ex: "Three robots move in formation.", exZh: "三台机器人编队移动。" }
      ]
    },
    {
      name: "🎛 自动控制原理",
      words: [
        { w: "control system", ipa: "/kənˈtroʊl ˈsɪstəm/", zh: "控制系统",        ex: "A robot is a control system.", exZh: "机器人就是一个控制系统。" },
        { w: "feedback",     ipa: "/ˈfiːdbæk/",         zh: "反馈",              ex: "Feedback makes the system stable.", exZh: "反馈使系统稳定。" },
        { w: "open loop",    ipa: "/ˈoʊpən luːp/",      zh: "开环（无反馈）",     ex: "An open loop has no feedback.", exZh: "开环没有反馈。" },
        { w: "closed loop",  ipa: "/kloʊzd luːp/",      zh: "闭环（有反馈）",     ex: "A closed loop uses feedback.", exZh: "闭环使用反馈。" },
        { w: "stability",    ipa: "/stəˈbɪləti/",       zh: "稳定性",            ex: "Stability is very important.", exZh: "稳定性非常重要。" },
        { w: "transfer function", ipa: "/ˈtrænsfɜːr ˈfʌŋkʃn/", zh: "传递函数",    ex: "We use a transfer function to model the system.", exZh: "我们用传递函数给系统建模。" },
        { w: "PID controller", ipa: "/ˌpiː aɪ ˈdiː kənˈtroʊlər/", zh: "PID控制器（比例-积分-微分）", ex: "I tune the PID controller.", exZh: "我整定PID控制器。" },
        { w: "proportional", ipa: "/prəˈpɔːrʃənl/",     zh: "比例的（P）",       ex: "P means proportional.",      exZh: "P表示比例。" },
        { w: "integral",     ipa: "/ˈɪntɪɡrəl/",        zh: "积分的（I）",       ex: "I means integral.",          exZh: "I表示积分。" },
        { w: "derivative",   ipa: "/dɪˈrɪvətɪv/",       zh: "微分的（D）",       ex: "D means derivative.",        exZh: "D表示微分。" },
        { w: "step response", ipa: "/step rɪˈspɑːns/",  zh: "阶跃响应",          ex: "The step response is fast.", exZh: "阶跃响应很快。" },
        { w: "steady state", ipa: "/ˈstedi steɪt/",     zh: "稳态",              ex: "The system reaches a steady state.", exZh: "系统达到稳态。" },
        { w: "overshoot",    ipa: "/ˌoʊvərˈʃuːt/",      zh: "超调量",            ex: "The overshoot is small.",    exZh: "超调量很小。" },
        { w: "damping",      ipa: "/ˈdæmpɪŋ/",          zh: "阻尼",              ex: "Damping reduces oscillation.", exZh: "阻尼减小振荡。" },
        { w: "oscillation",  ipa: "/ˌɑːsɪˈleɪʃn/",      zh: "振荡",              ex: "The oscillation is small.",  exZh: "振荡很小。" },
        { w: "pole",         ipa: "/poʊl/",             zh: "极点",              ex: "The poles are on the left side.", exZh: "极点在左半平面。" },
        { w: "gain",         ipa: "/ɡeɪn/",             zh: "增益（放大倍数）",   ex: "The gain is too high.",      exZh: "增益太大了。" },
        { w: "phase",        ipa: "/feɪz/",             zh: "相位",              ex: "The phase is ninety degrees.", exZh: "相位是90度。" },
        { w: "disturbance",  ipa: "/dɪˈstɜːrbəns/",     zh: "扰动（外部干扰）",   ex: "A disturbance makes the robot shake.", exZh: "扰动使机器人晃动。" },
        { w: "setpoint",     ipa: "/ˈsetpɔɪnt/",        zh: "设定值（目标值）",   ex: "The robot follows the setpoint.", exZh: "机器人跟随设定值。" },
        { w: "actuator",     ipa: "/ˈæktʃueɪtər/",      zh: "执行器（如电机）",   ex: "The motor is an actuator.",  exZh: "电机是一种执行器。" },
        { w: "modeling",     ipa: "/ˈmɑːdəlɪŋ/",        zh: "建模",              ex: "Modeling is the first step.", exZh: "建模是第一步。" },
        { w: "Laplace transform", ipa: "/ləˈplɑːs ˈtrænsfɔːrm/", zh: "拉普拉斯变换", ex: "The Laplace transform makes math easy.", exZh: "拉普拉斯变换让数学变简单。" }
      ]
    },
    {
      name: "🔧 嵌入式开发",
      words: [
        { w: "embedded system", ipa: "/ɪmˈbedɪd/",     zh: "嵌入式系统",        ex: "An embedded system is a small computer.", exZh: "嵌入式系统是一台小计算机。" },
        { w: "chip",         ipa: "/tʃɪp/",            zh: "芯片",              ex: "This chip is very small.",   exZh: "这颗芯片很小。" },
        { w: "STM32",        ipa: "/ˌes tiː ˈem ˈθɜːrti tuː/", zh: "一种主流单片机（32位微控制器）", ex: "My code runs on STM32.", exZh: "我的代码跑在STM32上。" },
        { w: "firmware",     ipa: "/ˈfɜːrmwer/",       zh: "固件",              ex: "I write the firmware.",      exZh: "我写固件。" },
        { w: "driver",       ipa: "/ˈdraɪvər/",        zh: "驱动程序",          ex: "I wrote the ADC driver.",    exZh: "我写了ADC驱动。" },
        { w: "PWM",          ipa: "/ˌpiː dʌbljuː ˈem/", zh: "脉宽调制（控制电机转速的信号）", ex: "PWM controls motor speed.", exZh: "PWM控制电机转速。" },
        { w: "ADC",          ipa: "/ˌeɪ diː ˈsiː/",    zh: "模数转换器（读电压用）", ex: "ADC reads the voltage.",  exZh: "ADC读取电压。" },
        { w: "serial port",  ipa: "/ˈsɪriəl pɔːrt/",   zh: "串口",              ex: "I use the serial port to debug.", exZh: "我用串口调试。" },
        { w: "interrupt",    ipa: "/ˌɪntəˈrʌpt/",      zh: "中断",              ex: "The interrupt is very fast.", exZh: "中断响应很快。" },
        { w: "debug",        ipa: "/ˌdiːˈbʌɡ/",        zh: "调试",              ex: "I debug the code line by line.", exZh: "我逐行调试代码。" }
      ]
    },
    {
      name: "⚡ 电子硬件",
      words: [
        { w: "circuit",      ipa: "/ˈsɜːrkɪt/",        zh: "电路",              ex: "This circuit is simple.",    exZh: "这个电路很简单。" },
        { w: "PCB",          ipa: "/ˌpiː siː ˈbiː/",   zh: "印刷电路板",        ex: "The PCB has four layers.",  exZh: "这块PCB有四层。" },
        { w: "schematic",    ipa: "/skɪˈmætɪk/",       zh: "原理图",            ex: "I draw the schematic first.", exZh: "我先画原理图。" },
        { w: "board",        ipa: "/bɔːrd/",           zh: "电路板",            ex: "I made a circuit board.",    exZh: "我做了一块电路板。" },
        { w: "solder",       ipa: "/ˈsɑːdər/",         zh: "焊接",              ex: "I solder the parts by hand.", exZh: "我手工焊接元件。" },
        { w: "capacitor",    ipa: "/kəˈpæsɪtər/",      zh: "电容器",            ex: "A capacitor stores energy.", exZh: "电容储存能量。" },
        { w: "resistor",     ipa: "/rɪˈzɪstər/",       zh: "电阻器",            ex: "A resistor limits the current.", exZh: "电阻限制电流。" },
        { w: "voltage",      ipa: "/ˈvoʊltɪdʒ/",       zh: "电压",              ex: "The voltage is five volts.", exZh: "电压是5伏。" },
        { w: "current",      ipa: "/ˈkɜːrənt/",        zh: "电流",              ex: "The current is too big.",    exZh: "电流太大了。" },
        { w: "filter",       ipa: "/ˈfɪltər/",         zh: "滤波器",            ex: "The filter removes noise.",  exZh: "滤波器去除噪声。" },
        { w: "noise",        ipa: "/nɔɪz/",            zh: "噪声",              ex: "The noise is from the power.", exZh: "噪声来自电源。" },
        { w: "power supply", ipa: "/ˈpaʊər səˈplaɪ/",  zh: "电源",              ex: "The power supply is stable.", exZh: "电源很稳定。" }
      ]
    },
    {
      name: "🚁 你的项目与竞赛",
      words: [
        { w: "drone",        ipa: "/droʊn/",           zh: "无人机",            ex: "The drone can fly.",         exZh: "这架无人机能飞。" },
        { w: "ESC",          ipa: "/ˌiː es ˈsiː/",     zh: "电子调速器（电调）", ex: "The ESC controls the motor.", exZh: "电调控制电机。" },
        { w: "FFT",          ipa: "/ˌef ef ˈtiː/",     zh: "快速傅里叶变换（算频谱）", ex: "FFT shows the frequency.", exZh: "FFT显示频率。" },
        { w: "signal",       ipa: "/ˈsɪɡnəl/",         zh: "信号",              ex: "The signal is clean now.",   exZh: "信号现在很干净。" },
        { w: "frequency",    ipa: "/ˈfriːkwənsi/",     zh: "频率",              ex: "The frequency is 50 Hz.",    exZh: "频率是50赫兹。" },
        { w: "contest",      ipa: "/ˈkɑːntest/",       zh: "竞赛",              ex: "I joined the electronic contest.", exZh: "我参加了电子设计竞赛。" },
        { w: "prize",        ipa: "/praɪz/",           zh: "奖项",              ex: "I won a second prize.",      exZh: "我得了二等奖。" },
        { w: "team",         ipa: "/tiːm/",            zh: "团队",              ex: "We are a team of three.",    exZh: "我们是三人团队。" },
        { w: "open source",  ipa: "/ˈoʊpən sɔːrs/",    zh: "开源",              ex: "My code is open source.",    exZh: "我的代码是开源的。" },
        { w: "website",      ipa: "/ˈwebsaɪt/",        zh: "网站",              ex: "I built a robot website.",   exZh: "我建了一个机器人网站。" }
      ]
    },
    {
      name: "📘 核心课程 & 学业",
      words: [
        { w: "major",        ipa: "/ˈmeɪdʒər/",        zh: "专业",              ex: "My major is Robot Engineering.", exZh: "我的专业是机器人工程。" },
        { w: "GPA",          ipa: "/ˌdʒiː piː ˈeɪ/",   zh: "平均绩点",          ex: "My GPA is 3.79.",            exZh: "我的绩点是3.79。" },
        { w: "rank",         ipa: "/ræŋk/",            zh: "排名",              ex: "I rank first.",              exZh: "我排名第一。" },
        { w: "automatic control", ipa: "/ˌɔːtəˈmætɪk kənˈtroʊl/", zh: "自动控制（原理）", ex: "Automatic control is my course.", exZh: "自动控制是我的课程。" },
        { w: "electronics",  ipa: "/ɪˌlekˈtrɑːnɪks/",  zh: "电子学",            ex: "Electronics is useful.",     exZh: "电子学很有用。" },
        { w: "mechanical design", ipa: "/məˈkænɪkl dɪˈzaɪn/", zh: "机械设计",     ex: "I learned mechanical design.", exZh: "我学过机械设计。" },
        { w: "mathematics",  ipa: "/ˌmæθəˈmætɪks/",    zh: "数学",              ex: "I use math every day.",      exZh: "我每天都在用数学。" },
        { w: "experiment",   ipa: "/ɪkˈsperɪmənt/",    zh: "实验",              ex: "The experiment works well.", exZh: "实验运行良好。" },
        { w: "thesis",       ipa: "/ˈθiːsɪs/",         zh: "论文（学位论文）",   ex: "I read a thesis every week.", exZh: "我每周读一篇论文。" },
        { w: "graduate school", ipa: "/ˈɡrædʒuət skuːl/", zh: "研究生院",        ex: "I want to go to graduate school.", exZh: "我想读研。" }
      ]
    },
    {
      name: "🗣 面试日常用语",
      words: [
        { w: "interview",    ipa: "/ˈɪntərvjuː/",      zh: "面试",              ex: "This is my interview.",      exZh: "这是我的面试。" },
        { w: "hello",        ipa: "/həˈloʊ/",          zh: "你好（任何时间都适用）", ex: "Hello, professors.",    exZh: "各位老师好。" },
        { w: "good morning", ipa: "/ɡʊd ˈmɔːrnɪŋ/",    zh: "早上好（上午面试用）", ex: "Good morning, professors.", exZh: "各位老师，早上好。" },
        { w: "good afternoon", ipa: "/ɡʊd ˌæftərˈnuːn/", zh: "下午好（下午面试用）", ex: "Good afternoon, professors.", exZh: "各位老师，下午好。" },
        { w: "good evening", ipa: "/ɡʊd ˈiːvnɪŋ/",     zh: "晚上好（傍晚面试用）", ex: "Good evening, professors.", exZh: "各位老师，晚上好。" },
        { w: "professor",    ipa: "/prəˈfesər/",       zh: "教授",              ex: "Good morning, Professor.",   exZh: "教授早上好。" },
        { w: "self-introduction", ipa: "/ˌself ˌɪntrəˈdʌkʃn/", zh: "自我介绍",   ex: "Let me introduce myself.",   exZh: "让我介绍一下自己。" },
        { w: "hobby",        ipa: "/ˈhɑːbi/",          zh: "爱好",              ex: "My hobby is making things.", exZh: "我的爱好是动手做东西。" },
        { w: "nervous",      ipa: "/ˈnɜːrvəs/",        zh: "紧张的",            ex: "I am a little nervous.",     exZh: "我有点紧张。" },
        { w: "confident",    ipa: "/ˈkɑːnfɪdənt/",     zh: "自信的",            ex: "Be confident.",              exZh: "要自信。" },
        { w: "opportunity",  ipa: "/ˌɑːpərˈtuːnəti/",  zh: "机会",              ex: "Thank you for this opportunity.", exZh: "感谢这个机会。" },
        { w: "research",     ipa: "/rɪˈsɜːrtʃ/",       zh: "研究",              ex: "I want to do research.",     exZh: "我想做研究。" },
        { w: "future",       ipa: "/ˈfjuːtʃər/",       zh: "未来",              ex: "I want to be an engineer in the future.", exZh: "将来我想当工程师。" },
        { w: "dream",        ipa: "/driːm/",           zh: "梦想",              ex: "My dream is to study robots.", exZh: "我的梦想是研究机器人。" }
      ]
    }
  ],

  /* ---------------- 5. 应试策略 ---------------- */
  tips: [
    { icon: "✂️", title: "短句原则", body: "一句别超过 10 个词。句子越短，出错越少。面试官不会因为你用词简单扣分，但会因为听不懂扣分。" },
    { icon: "🧲", title: "主动引导话题", body: "把回答往你背熟的内容上引。比如被问爱好，就说\"making circuit boards\"，老师一追问就进了你准备好的项目答案。" },
    { icon: "🚫", title: "不背长难句", body: "背了 50 词长段落，忘一个词就全卡住。只背短句，忘词就停下，说完 That is all. Thank you. 就好。" },
    { icon: "🐢", title: "说得慢 = 显得稳", body: "语速放慢，一个词一个词说。慢不扣分，还给你思考时间。网页里把朗读语速调到 0.5x 跟着读找节奏。" },
    { icon: "🛟", title: "听不懂就救场", body: "背熟\"救场金句\"里的前 3 句。让老师重复问题不丢人，答非所问才丢人。" },
    { icon: "🇯🇵", title: "日语考生话术", body: "被问\"为什么学日语\"：高中开始学（客观原因）+ 现在天天读英文文档（证明能力）。别说\"英语太难\"。" },
    { icon: "🔁", title: "考前怎么练", body: "自我介绍 30 秒版读 20 遍 → 背诵模式自测 → 1.0x 听一遍自己的节奏。问答部分重点背：缺点、规划、选校、日语，这四题几乎必问。" },
    { icon: "😊", title: "心态", body: "英语面试只占一小部分，你的排名 1/50、省二等奖、三个项目才是硬实力。英语部分目标不是惊艳，是不出错。" }
  ]
};
