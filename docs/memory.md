---
sidebar_position: 3
title: "Persistent Memory"
description: "How the agent remembers across sessions with SOUL.md, MEMORY.md, USER.md, and session search"
---

# Persistent Memory

The agent has bounded, curated memory that persists across sessions. This keeps its long-term personality, project knowledge, and user preferences available without forcing every conversation to start from zero.

## How It Works

Three files make up the built-in persistent memory:

| File | Purpose | Char Limit |
|------|---------|------------|
| **SOUL.md** | Agent personality, values, and default interaction style | 1,100 chars |
| **MEMORY.md** | Agent notes about environment, projects, conventions, and lessons learned | 2,200 chars |
| **USER.md** | User profile, preferences, and communication expectations | 1,375 chars |

All three files live in `~/.deepclaw/memories/` and are injected into the system prompt as a frozen snapshot at session start.

The `memory` tool manages them through three targets:

- `soul` for agent personality and voice
- `memory` for project and environment facts
- `user` for user profile and preferences

Character limits keep the snapshot compact. When a store is near capacity, the agent should consolidate or replace entries instead of growing indefinitely.

## How Memory Appears in the System Prompt

At session start, the runtime loads the three stores from disk and renders a frozen block in this order:

1. `SOUL.md`
2. `MEMORY.md`
3. `USER.md`

Each non-empty store renders a section header with usage information, followed by entries separated by the section-sign delimiter `§`.

Example:

```text
SOUL (agent personality and values) [32% - 352/1100 chars]
Be concise, grounded, and respectful. Prefer direct answers over performance.
§
Default to pragmatic tradeoffs. Avoid hype and unnecessary reassurance.

MEMORY (your personal notes) [9% - 201/2200 chars]
Project root is C:/Software/Codes/py/NoteMark. Build with npm run build.

USER PROFILE (user preferences and communication style) [7% - 98/1375 chars]
User prefers concise technical explanations and dislikes filler.
```

This snapshot is frozen for the lifetime of the chat session. If the agent updates memory mid-session, the files on disk change immediately, but the injected system-prompt snapshot does not refresh until the next session.

## Memory Tool Actions

The `memory` tool supports:

- `add`
- `replace`
- `remove`

There is no `read` action. The current memory snapshot is injected automatically at session start, and tool responses return the live on-disk state after each operation.

`replace` and `remove` use `old_text` substring matching. The substring must uniquely identify exactly one entry in the selected store.

## What Belongs in Each Store

### `soul`

Use `SOUL.md` for stable agent identity:

- Tone and voice
- Core values
- Behavioral defaults
- Standing response posture

Good examples:

- `Be concise, calm, and technically rigorous.`
- `Prefer clear tradeoff explanations over confident hand-waving.`
- `Challenge weak assumptions directly, but stay respectful.`

Do not put these in `SOUL.md`:

- Project structure
- User preferences
- Temporary task instructions
- Facts already better represented in `MEMORY.md` or `USER.md`

### `memory`

Use `MEMORY.md` for long-lived facts the agent learns about the environment and work:

- Project conventions
- Tooling and build commands
- Infrastructure details
- Lessons learned
- Durable workflow facts

Examples:

- `Project uses Electron, React, TypeScript, and Vitest.`
- `Run desktop build with npm run build.`
- `Renderer should not access Node APIs directly; use preload and IPC.`

### `user`

Use `USER.md` for user identity and preferences:

- Communication style
- Formatting preferences
- Tooling preferences
- Recurring workflow expectations

Examples:

- `User prefers concise responses with minimal fluff.`
- `User wants implementation-first behavior instead of long proposal messages.`

## Save vs Skip

Save these proactively:

- Durable user preferences to `user`
- Durable project and environment facts to `memory`
- Explicit agent persona customization to `soul`
- Corrections that will matter in later sessions to `memory`

Skip these:

- Obvious or trivial facts
- Large raw logs or code dumps
- One-off debugging context
- Temporary instructions for the current task only
- Information that already belongs in the live conversation context

## Capacity Management

The built-in stores stay intentionally small:

| Store | Limit | Typical use |
|-------|-------|-------------|
| `soul` | 1,100 chars | 5-10 concise persona rules |
| `memory` | 2,200 chars | 8-15 factual entries |
| `user` | 1,375 chars | 5-10 preference entries |

If an update would exceed the limit, the tool returns a structured failure with current usage and projected usage. The agent should remove stale entries or replace several related entries with a shorter consolidated version.

## Duplicate Prevention and Security

Exact duplicate entries are ignored as successful no-op writes.

Because persistent memory is injected into the system prompt, every entry is scanned before being accepted. The memory layer blocks content that looks like:

- prompt injection
- secret exfiltration instructions
- embedded SSH credentials
- invisible or disallowed control Unicode

## Session Search

Persistent memory is not the only recall mechanism. The agent can also search past sessions using `session_search`.

Use persistent memory for facts that should always be available in the prompt. Use session search for historical recall such as "what did we decide last week?"

## External Memory Providers

External memory providers can extend the built-in system with semantic recall or richer long-term memory. They complement `SOUL.md`, `MEMORY.md`, and `USER.md`; they do not replace the built-in stores.
