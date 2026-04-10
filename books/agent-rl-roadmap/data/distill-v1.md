可以，但先区分一下“轨迹”：

1. **可观测轨迹**：用户输入、assistant 输出、工具调用、命令、文件改动、测试结果、权限决策、时间戳。
2. **隐藏推理**：模型内部 chain-of-thought。这个通常**拿不到，也不该指望拿到**。
   真正能稳定采集、也最有训练价值的，都是第 1 类。Claude Code 和 Codex 现在都提供了围绕 agent 生命周期的可观测入口，但方式不完全一样。([Claude API Docs][1])

## 一句话结论

**最实用的办法不是“抓屏”或“扒前端”，而是：**

* **Claude Code**：用 **hooks** 在 `UserPromptSubmit / PreToolUse / PostToolUse / Stop / SessionEnd` 等事件上把 JSON 发到你自己的日志系统。Claude 个人/组织导出更适合补全历史，不适合实时细粒度轨迹。([Claude API Docs][1])
* **Codex**：优先用 **`codex exec --json`** 捕获逐事件 JSONL；交互式会话则读本地 transcript / session files，再叠加 hooks 或 OTel 导出做增强。([OpenAI 开发者][2])

---

# 一、Claude Code 怎么抓轨迹

## 1）最推荐：用 hooks 抓生命周期事件

Claude Code 官方提供 hooks。它们会在会话生命周期的关键点触发，并把**事件上下文 JSON** 传给你的 hook handler。官方文档明确写了 hooks 可以在 `SessionStart`、`SessionEnd`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`、`StopFailure` 等节点触发；输入会以 JSON 形式通过 stdin 或 HTTP POST body 传给你的处理器。([Claude API Docs][1])

这意味着你可以稳定记录：

* 用户 prompt
* 工具名
* 工具输入
* 工具是否成功
* 失败原因
* 会话开始/结束
* 停止时机
* 配置变化、文件变化等异步事件

这些基本就是蒸馏 agent 的核心轨迹。([Claude API Docs][1])

### 你应该重点监听的事件

最有价值的是这几个：

* `UserPromptSubmit`
* `PreToolUse`
* `PostToolUse`
* `PostToolUseFailure`
* `Stop`
* `SessionEnd`

Claude Code 文档把这些事件列成了标准 hook 事件，并说明 `PreToolUse` 在工具执行前触发，`PostToolUse` 在成功后触发，`PostToolUseFailure` 在失败后触发。([Claude][3])

### 推荐记录字段

你自己的日志 schema 建议至少有：

```json
{
  "provider": "claude_code",
  "session_id": "...",
  "turn_id": "...",
  "event": "PreToolUse",
  "ts": "...",
  "user_prompt": "...",
  "tool_name": "Bash",
  "tool_input": {"command": "pytest -q"},
  "tool_output": "...",
  "success": true,
  "cwd": "...",
  "repo": "...",
  "files_changed": [],
  "approval": "auto|manual|denied",
  "final_message": "..."
}
```

这样后面可以直接切成：

* SFT：`user_prompt -> final_message`
* Tool-use SFT：`state -> next_tool_call`
* Preference：失败尝试 vs 成功尝试

---

## 2）Claude Code 的最小可用做法

在 `~/.claude/settings.json` 或项目级设置里配 hook，把每个事件发给本地 collector。Claude Code 官方文档说明 hooks 是通过 settings JSON 配置的，支持 command / HTTP / prompt hooks。([Claude API Docs][1])

思路像这样：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ./log_hook.py >> /tmp/claude_trajectory.jsonl"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ./log_hook.py >> /tmp/claude_trajectory.jsonl"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ./log_hook.py >> /tmp/claude_trajectory.jsonl"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ./log_hook.py >> /tmp/claude_trajectory.jsonl"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ./log_hook.py >> /tmp/claude_trajectory.jsonl"
          }
        ]
      }
    ]
  }
}
```

然后 `log_hook.py` 从 stdin 读 JSON，补一个时间戳，写成 JSONL。

### 为什么这比聊天导出更好

Claude 官方的个人导出和组织导出能导出 conversation data，但更适合**拿历史聊天**，不适合细粒度抓每次工具调用。个人导出从 Settings → Privacy → Export data 发起；组织导出由 Team / Enterprise Primary Owner 从 Data and Privacy 发起。([Claude帮助中心][4])

所以：

* **想补历史会话**：用官方 export
* **想做蒸馏级轨迹采集**：用 hooks

---

## 3）如果你不是用 CLI，而是自己封装 Claude agent

Anthropic 现在把 Claude Code SDK 重命名成 **Claude Agent SDK**。官方写得很明确：它给你“和 Claude Code 相同的 tools、agent loop、context management”，并且支持流式输出；启用 partial message streaming 后，可以实时收到文本和工具调用流。([Claude API Docs][5])

这时最佳做法不是再“拦截 Claude Code”，而是：

* 直接在 SDK 外层记录输入输出
* 对 tool executor 做包裹
* 记录每次工具请求与结果
* 保存最终 answer 和 patch

这样比 CLI 后抓更稳。

---

# 二、Codex 怎么抓轨迹

## 1）最推荐：`codex exec --json`

Codex 官方已经把这件事做得比较直接了。文档说明：`codex exec --json` 会把 stdout 变成 **JSONL event stream**，你可以捕获 Codex 运行期间发出的每个事件；事件类型包括 `thread.started`、`turn.started`、`turn.completed`、`turn.failed`、`item.*` 和 `error`。([OpenAI 开发者][2])

这其实就是天然的 trajectory 流。

### 典型用法

```bash
codex exec --json "fix the CI failure" > codex_run.jsonl
```

这个文件后处理时，你就可以提取：

* 用户任务
* turn 开始/结束
* 中间 item 事件
* tool 使用
* web_search
* 最终输出
* error

Codex 文档还提到，web search 项会出现在 transcript 或 `codex exec --json` 输出里。([OpenAI 开发者][6])

---

## 2）交互式会话：直接读本地 transcript / session files

Codex 官方文档写明：

* Codex 会把对话 transcript 存在本地，便于 resume；([OpenAI 开发者][7])
* 默认会把本地 history 持久化到 `CODEX_HOME` 下，例如 `~/.codex/history.jsonl`；([OpenAI 开发者][8])
* 社区和 issue 中也反复提到 session JSONL 位于 `~/.codex/sessions/.../rollout-*.jsonl`。虽然这部分最直接的路径说明很多来自 issue，而不是主文档，所以我会把它当作**实现层现象**，不是最稳的接口。([GitHub][9])

所以更稳的优先级是：

1. `codex exec --json`
2. OTel exporter
3. hooks
4. 本地 transcript/history/session files

---

## 3）Codex hooks

Codex 也有 hooks，而且官方明确说它们可以把 conversation 发到自定义 logging / analytics engine。当前文档说明 hooks 仍是 experimental，需要在 `config.toml` 打开 `codex_hooks = true`，并支持 `PreToolUse`、`PostToolUse`、`UserPromptSubmit`、`Stop` 等 turn-scope 事件。([OpenAI 开发者][10])

也就是说，Codex 侧你可以像 Claude Code 一样做事件级采集，只是目前：

* 功能更偏实验性
* Windows 暂时不支持 hooks。([OpenAI 开发者][10])

---

## 4）Codex OTel / structured logs

Codex 高级配置文档还提供了更企业化的方式：**OTel 导出**。文档明确写道 Codex 会发出结构化 log events，比如：

* `codex.conversation_starts`
* `codex.api_request`
* `codex.sse_event`
* `codex.user_prompt`
* `codex.tool_decision`
* `codex.tool_result`
  并说明如果 `exporter = "none"`，Codex 仍记录事件，只是不发送。([OpenAI 开发者][11])

这很适合接入：

* OpenTelemetry Collector
* Datadog
* Honeycomb
* ELK / Loki
* 你自己的 event bus

如果你要做团队级采集，这是 Codex 目前最像“正式生产方案”的入口。([OpenAI 开发者][11])

---

# 三、真正该采什么，不该采什么

## 建议采的

对蒸馏有价值的轨迹通常是：

* 用户目标
* 环境上下文（repo、branch、cwd、language）
* 工具调用序列
* 每步工具输入/输出摘要
* 文件 diff
* 测试 / lint / build 结果
* 权限决策
* 最终 answer / patch
* 是否被用户接受
* 失败后修复链路

Claude Code hooks 和 Codex JSON/OTel 都足够支撑这类结构化采样。([Claude API Docs][1])

## 不建议追求的

不要把“轨迹”理解成：

* 模型内部隐藏思维全文
* UI 上的临时 reasoning summary
* 非公开、非稳定字段

因为这些不一定稳定、也不一定能合法获取。训练时更通用的做法是用**可观测行为轨迹**替代内部推理。

---

# 四、我建议你的落地方案

## 方案 A：你要抓 Claude Code

最稳方案：

1. 在 Claude Code 开 hooks
2. 监听 `UserPromptSubmit / PreToolUse / PostToolUse / PostToolUseFailure / Stop / SessionEnd`
3. 每个事件写 JSONL
4. 对 Bash/Read/Edit/Write 单独做 schema 规范化
5. 每个 turn 额外生成：

   * `final_answer`
   * `git diff`
   * `test_result`
   * `accepted/rejected`

这样基本就能做 agent 蒸馏。

---

## 方案 B：你要抓 Codex

最稳方案：

1. 能 headless 的任务全部走 `codex exec --json`
2. 交互式任务保留本地 transcripts/history
3. 团队环境打开 OTel
4. 有需要再启用 hooks 做细粒度补充
5. 把所有 event 统一写成内部 schema

---

# 五、统一 schema 最重要

不管 Claude Code 还是 Codex，最后都建议转成统一格式，例如：

```json
{
  "provider": "claude_code",
  "session_id": "xxx",
  "turn_id": "yyy",
  "task": "fix flaky unit test",
  "events": [
    {
      "type": "user_prompt",
      "text": "fix the failing tests"
    },
    {
      "type": "tool_call",
      "tool": "Bash",
      "input": {"command": "pytest -q"},
      "output": {"exit_code": 1, "stdout": "...", "stderr": "..."}
    },
    {
      "type": "tool_call",
      "tool": "Edit",
      "input": {"file": "foo.py", "patch": "..."}
    }
  ],
  "final_answer": "...",
  "artifacts": {
    "git_diff": "...",
    "tests_passed": true
  },
  "labels": {
    "accepted": true,
    "task_type": "bugfix"
  }
}
```

这样你后面才能同时做：

* SFT
* tool-use imitation
* preference learning
* patch ranking

---

# 六、最实际的判断

如果你问的是“**如何尽快开始**”，我的建议是：

* **Claude Code**：先上 hooks
* **Codex**：先上 `codex exec --json`
* 两边都不要一开始就追求全量会话导出
* 优先抓**任务级、事件级、可复现的 agent 轨迹**

因为这类数据最干净，也最接近业界常用的 agent distillation 原料。([OpenAI 开发者][10])

下一步我可以直接给你一套可用的：
**Claude Code hooks + Codex JSONL 统一采集器脚本**，把两边都落到同一个训练数据 schema。

[1]: https://docs.anthropic.com/en/docs/claude-code/hooks "Hooks reference - Claude Code Docs"
[2]: https://developers.openai.com/codex/noninteractive?utm_source=chatgpt.com "Non-interactive mode – Codex"
[3]: https://code.claude.com/docs/en/plugins-reference?utm_source=chatgpt.com "Plugins reference - Claude Code Docs"
[4]: https://support.anthropic.com/en/articles/9450526-how-can-i-export-my-claude-ai-data "How can I export my Claude data? | Claude Help Center"
[5]: https://docs.anthropic.com/en/docs/claude-code/sdk "Agent SDK overview - Claude Code Docs"
[6]: https://developers.openai.com/codex/cli/features "Features – Codex CLI | OpenAI Developers"
[7]: https://developers.openai.com/codex/cli/features?utm_source=chatgpt.com "Codex CLI Features"
[8]: https://developers.openai.com/codex/config-advanced?utm_source=chatgpt.com "Advanced Configuration – Codex"
[9]: https://github.com/openai/codex/issues/15411?utm_source=chatgpt.com "macOS desktop startup crash when a rollout JSONL ..."
[10]: https://developers.openai.com/codex/hooks "Hooks – Codex | OpenAI Developers"
[11]: https://developers.openai.com/codex/config-advanced "Advanced Configuration – Codex | OpenAI Developers"
