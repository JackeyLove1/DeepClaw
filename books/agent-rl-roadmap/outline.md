# Agent RL 可执行学习目录

## 0. 总目标

12 周后，你要达到这 4 个结果：

* 能解释 MDP、Bellman、Policy Gradient、Actor-Critic、PPO
* 能自己写一个最小 PPO 训练框架
* 能理解 SFT、DPO、Reward Model、RFT/GRPO 的关系
* 能做一个小型 **Agent RL 项目**：带工具、带 verifier、带 eval

---

# 第一阶段：打基础骨架（第 1–2 周）

## 第 1 周：RL 语言体系入门

### 学习目标

搞懂 RL 在说什么，不再把它看成“一个神秘 loss”。

### 学习内容

1. MDP 基本元素

   * state
   * action
   * reward
   * policy
   * transition
   * episode
   * return

2. Value Function

   * (V^\pi(s))
   * (Q^\pi(s,a))

3. Bellman Equation

   * Bellman expectation
   * Bellman optimality

### 资料

* Sutton & Barto：前几章
* Berkeley CS285 的 RL fundamentals 与课程资源页中的教材/课程入口 ([伯克利人工智能与机器人实验室][1])

### 执行动作

* 手写一份 2–3 页笔记，标题：`RL 基本概念总览`
* 自己推导 Bellman Equation，不抄答案
* 用自己的话解释：

  * “为什么 RL 比 supervised learning 难？”
  * “奖励为什么会延迟？”

### 本周产出

* `notes/week1_rl_basics.md`
* 一张你自己画的 RL 概念图

### 验收标准

你能不看资料，独立回答：

* MDP 是什么？
* return 和 reward 区别是什么？
* Q 和 V 区别是什么？
* 为什么 Bellman equation 是递归定义？

---

## 第 2 周：MC / TD / Bootstrapping

### 学习目标

理解 RL 的“学习信号”从哪来。

### 学习内容

1. Monte Carlo
2. Temporal Difference
3. Bootstrapping
4. Bias / Variance 基本直觉
5. On-policy / Off-policy 直觉

### 执行动作

* 对比整理：

  * MC 为什么方差大
  * TD 为什么更高效
  * bootstrapping 为什么重要
* 写一个小表总结：

  * supervised learning vs RL
  * MC vs TD

### 本周产出

* `notes/week2_mc_td.md`
* 一页对比表：`mc_vs_td.png` 或 markdown 表格

### 验收标准

你能解释：

* 为什么 TD 不需要等整个 episode 结束？
* 为什么 RL 的训练目标会跟着策略变化？
* 什么叫 bootstrapping？

---

# 第二阶段：核心算法（第 3–6 周）

## 第 3 周：Value-based 方法

### 学习目标

理解 DQN 系思想，不要求深挖所有变体。

### 学习内容

1. Q-learning
2. DQN 基本结构
3. Replay Buffer
4. Target Network
5. 为什么 value learning 会不稳定

Hugging Face Deep RL Course 的 syllabus 里包含 Q-Learning、Deep Q-Learning、Policy Gradient、Actor Critic、PPO 等完整路径，适合这一阶段边学边练。([Hugging Face][2])

### 执行动作

* 跑一个最简单 DQN 例子
* 看懂训练循环：

  * collect transition
  * store replay
  * sample batch
  * compute target
  * update network

### 本周产出

* `projects/dqn_cartpole/`
* 一份训练流程图

### 验收标准

你能解释：

* replay buffer 解决了什么？
* target network 为什么能稳定训练？
* Q-learning 为什么属于 value-based？

---

## 第 4 周：Policy Gradient

### 学习目标

理解“直接学策略”是什么意思。

### 学习内容

1. REINFORCE
2. Policy Gradient Theorem
3. log-prob trick
4. 为什么梯度方差大
5. baseline 的作用

### 执行动作

* 手推 REINFORCE 核心公式
* 自己写一版最小 policy gradient 训练循环
* 画一张图：

  * 输入状态
  * 输出动作分布
  * 采样动作
  * 收集 reward
  * 更新策略

### 本周产出

* `notes/week4_policy_gradient.md`
* `projects/reinforce_minimal/`

### 验收标准

你能解释：

* policy gradient 在优化什么？
* 为什么要乘 return？
* 为什么 baseline 能减方差？

---

## 第 5 周：Actor-Critic

### 学习目标

建立现代 RL 主干思维。

### 学习内容

1. actor 和 critic 的职责
2. value baseline
3. TD advantage
4. advantage function

### 执行动作

* 写出 actor-critic 训练伪代码
* 自己解释：

  * actor 学什么？
  * critic 学什么？
  * 两者为何互补？

### 本周产出

* `notes/week5_actor_critic.md`
* `actor_critic_pseudocode.md`

### 验收标准

你能回答：

* 为什么 actor-critic 比纯 REINFORCE 更稳定？
* critic 的误差会如何影响 actor？
* advantage 和 value 有什么关系？

---

## 第 6 周：PPO

### 学习目标

真正吃透 PPO，不只是会念 clip objective。

### 学习内容

1. old policy / new policy
2. importance ratio
3. clipping
4. KL constraint 的直觉
5. GAE 的作用

PPO 仍然是 deep RL 教学中的核心内容，Hugging Face Deep RL Course 也把 PPO 单独作为重要单元。([Hugging Face][2])

### 执行动作

* 自己写一个最小 PPO
* 至少包含：

  * rollout
  * advantage / GAE
  * clipped objective
  * policy update
  * value update
  * eval loop

### 本周产出

* `projects/minimal_ppo/`
* `notes/week6_ppo.md`

### 验收标准

你能解释：

* PPO 为什么比“直接猛更新策略”更稳？
* ratio 是什么？
* clip 在防什么？
* GAE 为什么常用？

---

# 第三阶段：把 RL 跑起来（第 7–8 周）

## 第 7 周：完整实践一遍

### 学习目标

把算法和工程连起来。

### 学习内容

* 用 Hugging Face Deep RL Course 或 CleanRL / SB3 跑通 1–2 个环境
* 重点看训练曲线、超参、评估方法，而不是只追 reward 数字

Hugging Face 课程说明它仍然保留完整的理论与 hands-on 内容，自学路径清晰，并给出每章约 3–4 小时的建议节奏。([Hugging Face][2])

### 执行动作

至少做 2 个环境：

1. CartPole 或 LunarLander
2. 一个连续控制环境

### 本周产出

* `experiments/env1_report.md`
* `experiments/env2_report.md`

每份报告都回答：

* observation 是什么？
* action 是什么？
* reward 合理吗？
* episode termination 条件是什么？
* 训练失败时是哪里出了问题？

---

## 第 8 周：自己做一个环境

### 学习目标

从“会用环境”进阶到“会定义任务”。

### 学习内容

设计一个简化 Agent 环境，例如：

* 数学求解环境
* 代码修复环境
* API/tool selection 环境
* 文本规划环境

### 执行动作

定义清楚四件事：

* state
* action
* reward
* done condition

### 本周产出

* `projects/custom_env/`
* `env_spec.md`

### 验收标准

你能把环境讲清楚：

* 这个任务为什么适合 RL？
* 奖励会不会被 hack？
* action space 为什么这么设计？

---

# 第四阶段：进入 LLM Agent RL（第 9–10 周）

## 第 9 周：LLM 后训练全景

### 学习目标

建立正确顺序：不是直接 RL，而是 eval → prompt → SFT → preference / reward → RL。

OpenAI 的 model optimization 指南明确把优化流程描述为：先写 eval，建立基线；再做 prompt；有需要时 fine-tuning；然后继续 eval 和迭代，形成 feedback flywheel。([OpenAI开发者][3])

### 学习内容

1. Prompt / Eval / SFT / DPO / RFT 的关系
2. 什么任务只用 prompt 就够
3. 什么任务需要 SFT
4. 什么任务值得用 RL

### 执行动作

写一份关系图：

* Prompting
* Evals
* SFT
* DPO
* RFT

### 本周产出

* `notes/week9_llm_post_training_map.md`

### 验收标准

你能解释：

* 为什么不是所有任务都需要 RL？
* SFT 和 DPO 各自适合什么？
* eval 为什么必须先有？

---

## 第 10 周：TRL 与 RFT 入门

### 学习目标

把 RL 从经典环境迁移到 LLM 训练语境。

Hugging Face TRL 当前提供 SFT、GRPO、DPO、Reward Modeling 等训练工具，还支持与面向 agentic workflows 的环境框架集成。OpenAI 的 RFT 文档则说明：训练时会对每个 prompt 采样多个候选答案，用自定义 grader 打分，再做 policy-gradient 更新。([Hugging Face][4])

### 学习内容

1. TRL 工具链
2. Reward Modeling
3. DPO / GRPO / PPO 在 LLM 场景下的角色
4. grader-driven training

### 执行动作

* 跑一个最小 TRL demo
* 理解数据格式
* 理解 reward / preference / judge 从哪来

### 本周产出

* `projects/trl_demo/`
* `notes/week10_trl_rft.md`

### 验收标准

你能解释：

* 为什么 LLM RL 不一定有“显式环境画面”
* grader 相当于什么
* 为什么 verifier / judge 很关键

---

# 第五阶段：Agent RL 项目（第 11–12 周）

## 第 11 周：设计自己的 Agent RL 任务

### 学习目标

进入真正的 Agent RL。

### 可选项目

选一个就够：

1. **代码修复 Agent**

   * 输入：buggy code
   * 动作：输出 patch / 修复方案
   * 奖励：单元测试通过率

2. **数学推理 Agent**

   * 输入：题目
   * 动作：多步推理 / 最终答案
   * 奖励：答案正确 + 格式正确

3. **工具调用 Agent**

   * 输入：任务
   * 动作：选择工具 / 组织步骤
   * 奖励：执行成功率、步骤成本、正确率

### 执行动作

写清楚：

* 状态表示
* 动作空间
* rollout 格式
* verifier / grader
* eval 集

### 本周产出

* `projects/agent_rl_project/spec.md`
* `reward_design.md`
* `eval_set.jsonl`

---

## 第 12 周：实验、复盘、写报告

### 学习目标

把“能跑”变成“能分析”。

### 你至少要比较 4 组

1. prompt only
2. SFT
3. SFT + verifier rerank
4. SFT + RL / RFT / GRPO

### 评估指标

* task success rate
* reward mean
* pass@k
* tool-use accuracy
* average steps
* token cost
* failure type breakdown

### 本周产出

* `final_report.md`
* `ablation_table.md`
* `readme.md`

### 验收标准

你能说清：

* RL 比 prompt/SFT 多带来了什么
* 是 reward 真有效，还是 eval 偏了
* 失败主要来自哪个环节：

  * exploration
  * reward design
  * verifier
  * data quality
  * rollout quality

---

# 贯穿全程的固定任务

## 每周固定 1：数学笔记

每周至少写 1 次，不求长，但必须自己写。

目录建议：

```text
notes/
  week1_rl_basics.md
  week2_mc_td.md
  week4_policy_gradient.md
  week5_actor_critic.md
  week6_ppo.md
  week9_llm_post_training_map.md
  week10_trl_rft.md
```

---

## 每周固定 2：实验日志

每次训练都记：

* 环境/任务
* 超参数
* reward 曲线
* eval 结果
* 异常现象
* 你的解释

目录建议：

```text
logs/
  exp001.md
  exp002.md
  exp003.md
```

---

## 每周固定 3：复盘问题

每周回答这 8 个问题：

1. state 是什么？
2. action 是什么？
3. reward 从哪来？
4. reward 稀疏吗？
5. credit assignment 怎么做？
6. on-policy 还是 off-policy？
7. 为什么这个更新更稳定？
8. 如何评估泛化？

---

# 推荐资料目录

## 基础

* Sutton & Barto
* Berkeley CS285 课程资源页列出了 lecture、过往课程、教材与相关课程入口，适合系统学习。([伯克利人工智能与机器人实验室][1])

## 动手

* Hugging Face Deep RL Course：覆盖 Q-Learning、Deep Q-Learning、Policy Gradient、Actor-Critic、PPO 等，且是自定进度学习。([Hugging Face][2])

## LLM 后训练

* Hugging Face TRL：支持 SFT、DPO、GRPO、Reward Modeling 等。([Hugging Face][4])
* OpenAI Model Optimization：强调 eval → prompt → fine-tune → eval 的迭代流程。([OpenAI开发者][3])
* OpenAI RFT：强调自定义 grader、采样候选、评分、policy-gradient 更新。([OpenAI开发者][5])

---

# 最后给你一个真正可落地的目录结构

```text
agent-rl-roadmap/
├── notes/
│   ├── week1_rl_basics.md
│   ├── week2_mc_td.md
│   ├── week4_policy_gradient.md
│   ├── week5_actor_critic.md
│   ├── week6_ppo.md
│   ├── week9_llm_post_training_map.md
│   └── week10_trl_rft.md
├── projects/
│   ├── dqn_cartpole/
│   ├── reinforce_minimal/
│   ├── minimal_ppo/
│   ├── custom_env/
│   ├── trl_demo/
│   └── agent_rl_project/
├── experiments/
│   ├── env1_report.md
│   ├── env2_report.md
│   └── ablation_table.md
├── logs/
│   ├── exp001.md
│   ├── exp002.md
│   └── exp003.md
├── papers/
│   └── reading_notes.md
├── evals/
│   ├── eval_set.jsonl
│   ├── grader_spec.md
│   └── metrics.md
└── final_report.md
```

---

# 你现在就可以开始的第一周任务

今天直接做这 4 件事：

1. 建这个目录结构
2. 写 `week1_rl_basics.md`
3. 手推 Bellman equation
4. 用 300 字写清楚：
   **“RL 和 supervised learning 最大区别是什么？”**

你要的话，我下一条可以直接继续给你：
**“这份目录对应的每日打卡版 30 天执行表”**。

[1]: https://rail.eecs.berkeley.edu/deeprlcourse/resources/ "CS 185/285 Resources"
[2]: https://huggingface.co/learn/deep-rl-course/unit0/introduction "Welcome to the  Deep Reinforcement Learning Course · Hugging Face"
[3]: https://developers.openai.com/api/docs/guides/model-optimization "Model optimization | OpenAI API"
[4]: https://huggingface.co/docs/trl/index "TRL - Transformers Reinforcement Learning · Hugging Face"
[5]: https://developers.openai.com/api/docs/guides/reinforcement-fine-tuning "Reinforcement fine-tuning | OpenAI API"
