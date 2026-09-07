/* ============================================================
   人形机器人学习站 · 全站专业英语词卡(点击朗读)
   由 site.js 的英语模块读取(导航栏「?」按钮 / 点读模式)。
   维护约定:
   - en  : 英文术语(面板显示;评分按小写包含匹配统计)
   - say : 可选,朗读发音拼写(默认读 en;缩写类给出读法)
   - zh  : 一句话中文释义(12~30 字)
   - cat : 分类 id(见下方 cats)
   ★ 同时被 _本地工具/板块评分.js 读取作为「专业英语」评分维度词表,
     修改字段名前先同步该脚本。
   ============================================================ */
window.EN_TERMS = {
  cats: [
    { id: "tf", name: "Transformer 与大模型", terms: [
      { en: "Transformer", zh: "完全基于注意力的序列模型,2017 年提出" },
      { en: "Attention", zh: "注意力:按相关性加权汇聚信息" },
      { en: "Self-Attention", zh: "自注意力:序列内部词与词互相打分", say: "self attention" },
      { en: "Multi-Head Attention", zh: "多头注意力:多组注意力并行再拼接" },
      { en: "Masked Multi-Head Attention", zh: "带掩码的多头注意力,不许偷看后面的词", say: "masked multi-head attention" },
      { en: "Embedding", zh: "嵌入:把离散符号映射为稠密向量" },
      { en: "Positional Encoding", zh: "位置编码:给向量注入位置信息" },
      { en: "RoPE", zh: "旋转位置编码:位置是一种旋转角度", say: "rope" },
      { en: "Feed Forward", zh: "前馈网络:逐位置独立的两层小网络", say: "feed forward" },
      { en: "Residual Connection", zh: "残差连接:输出加回输入的梯度捷径", say: "residual connection" },
      { en: "Layer Normalization", zh: "层归一化:稳定每层数值分布", say: "layer normalization" },
      { en: "RMSNorm", zh: "均方根归一化:去掉均值中心的轻量归一化", say: "R M S norm" },
      { en: "Softmax", zh: "把一组分数归一化为概率分布" },
      { en: "Token", zh: "词元:模型读写的最小单位" },
      { en: "Tokenizer", zh: "分词器:把文本切成 token" },
      { en: "BPE", zh: "字节对编码:高频组合合并成子词的切词算法", say: "byte pair encoding" },
      { en: "KV Cache", zh: "键值缓存:历史 K/V 存起来避免重算", say: "K V cache" },
      { en: "GQA", zh: "分组查询注意力:多个 Q 头共享一份 KV", say: "grouped query attention" },
      { en: "MLA", zh: "多头潜在注意力:低秩压缩 KV 的方案", say: "multi-head latent attention" },
      { en: "MoE", zh: "混合专家:路由器为每个词只选少数专家", say: "mixture of experts" },
      { en: "FlashAttention", zh: "精确的快速注意力:分块计算减少显存读写", say: "flash attention" },
      { en: "Scaling Laws", zh: "缩放定律:性能随规模可预测提升", say: "scaling laws" },
      { en: "Emergent Abilities", zh: "涌现能力:规模越过阈值出现的新能力", say: "emergent abilities" },
      { en: "Context Window", zh: "上下文窗口:一次能读的最大 token 数", say: "context window" },
      { en: "Pretraining", zh: "预训练:海量文本上学预测下一个词", say: "pretraining" }
    ]},
    { id: "agent", name: "Agent 与工作流", terms: [
      { en: "AI Agent", zh: "智能体:能感知、规划并调用工具完成任务的系统", say: "A I agent" },
      { en: "Chain-of-Thought", zh: "思维链:先写推理步骤再给答案", say: "chain of thought" },
      { en: "ReAct", zh: "推理+行动交替:边想边调工具的 Agent 范式", say: "re-act" },
      { en: "Function Calling", zh: "函数调用:模型按协议输出结构化参数调工具", say: "function calling" },
      { en: "Tool Use", zh: "工具使用:搜索/计算器/代码执行等外部能力", say: "tool use" },
      { en: "RAG", zh: "检索增强生成:先查资料再回答,可溯源", say: "retrieval augmented generation" },
      { en: "MCP", zh: "模型上下文协议:连接模型与工具数据的开放标准", say: "model context protocol" },
      { en: "Skill", zh: "技能包:带说明书的可复用能力目录", say: "skill" },
      { en: "Workflow", zh: "工作流:把模型调用编排成固定流程", say: "workflow" },
      { en: "Orchestration", zh: "编排:多模型/多工具的调度协作", say: "orchestration" },
      { en: "Memory", zh: "记忆:跨轮次保存的信息(上下文或外部存储)", say: "memory" },
      { en: "System Prompt", zh: "系统提示词:设定角色与规则的最前置指令", say: "system prompt" },
      { en: "Hallucination", zh: "幻觉:一本正经地编造不存在的内容", say: "hallucination" },
      { en: "Alignment", zh: "对齐:让模型行为符合人类意图与价值观", say: "alignment" },
      { en: "Reward Model", zh: "奖励模型:给回答打分用于强化学习", say: "reward model" },
      { en: "Reinforcement Learning", zh: "强化学习:靠奖励信号试错学习", say: "reinforcement learning" },
      { en: "RLHF", zh: "基于人类反馈的强化学习", say: "R L H F" },
      { en: "DPO", zh: "直接偏好优化:绕开奖励模型的偏好对齐", say: "D P O" },
      { en: "Distillation", zh: "蒸馏:让小模型学习大模型的输出", say: "distillation" }
    ]},
    { id: "prompt", name: "提示词与上下文", terms: [
      { en: "Prompt", zh: "提示词:给模型的输入指令" },
      { en: "Prompt Engineering", zh: "提示词工程:设计指令让模型表现更好", say: "prompt engineering" },
      { en: "Prompt Compression", zh: "提示词压缩:在保留关键信息下缩短输入", say: "prompt compression" },
      { en: "Context Compression", zh: "上下文压缩:摘要/裁剪历史以省窗口", say: "context compression" },
      { en: "Few-shot", zh: "少样本:在提示里给几个示例教任务", say: "few shot" },
      { en: "Zero-shot", zh: "零样本:不给示例直接做任务", say: "zero shot" },
      { en: "Temperature", zh: "温度:采样随机度,越高越发散", say: "temperature" },
      { en: "In-context Learning", zh: "上下文学习:靠提示里的示例学会任务", say: "in-context learning" },
      { en: "Instruction Tuning", zh: "指令微调:用指令-回答对教模型听话", say: "instruction tuning" },
      { en: "Jailbreak", zh: "越狱:绕过模型安全约束的攻击", say: "jailbreak" }
    ]},
    { id: "deploy", name: "推理与部署", terms: [
      { en: "Inference", zh: "推理:用训练好的模型生成结果", say: "inference" },
      { en: "Fine-tuning", zh: "微调:在预训练模型上继续训练特定任务", say: "fine tuning" },
      { en: "LoRA", zh: "低秩适配:只训练小矩阵的高效微调", say: "lora" },
      { en: "Quantization", zh: "量化:用更低数值精度压缩模型", say: "quantization" },
      { en: "Speculative Decoding", zh: "投机解码:小模型起草稿、大模型验证", say: "speculative decoding" },
      { en: "PagedAttention", zh: "分页注意力:像内存分页一样管理 KV", say: "paged attention" },
      { en: "Batching", zh: "批处理:多请求合并以提高吞吐", say: "batching" },
      { en: "Latency", zh: "延迟:从请求到响应的时间" },
      { en: "Throughput", zh: "吞吐量:单位时间处理的 token 数", say: "throughput" },
      { en: "GPU", zh: "图形处理器:大模型训练与推理的主力算力", say: "G P U" },
      { en: "NPU", zh: "神经网络处理器:端侧 AI 专用芯片", say: "N P U" },
      { en: "VRAM", zh: "显存:GPU 上承载模型与缓存", say: "V R A M" }
    ]},
    { id: "robot", name: "控制与具身智能", terms: [
      { en: "FOC", zh: "磁场定向控制:交流电机解耦控制的基础", say: "field oriented control" },
      { en: "SVPWM", zh: "空间矢量脉宽调制", say: "S V P W M" },
      { en: "PID", zh: "比例-积分-微分控制:最经典的反馈控制器", say: "P I D" },
      { en: "MPC", zh: "模型预测控制:滚动优化未来一段轨迹", say: "model predictive control" },
      { en: "ADRC", zh: "自抗扰控制:观测并抵消总扰动", say: "A D R C" },
      { en: "PWM", zh: "脉宽调制:用占空比等效电压", say: "P W M" },
      { en: "IMU", zh: "惯性测量单元:加速度计+陀螺仪", say: "I M U" },
      { en: "VLA", zh: "视觉-语言-动作模型:看懂、听懂、能动", say: "vision language action" },
      { en: "Sim2Real", zh: "仿真到现实:模拟训练迁移到真机", say: "sim to real" },
      { en: "Embodied AI", zh: "具身智能:有身体、与环境交互的 AI", say: "embodied A I" },
      { en: "Dexterous Manipulation", zh: "灵巧操作:多指手的精细控制", say: "dexterous manipulation" },
      { en: "Whole-Body Control", zh: "全身控制:多关节协同的统一控制", say: "whole body control" }
    ]}
  ]
};
