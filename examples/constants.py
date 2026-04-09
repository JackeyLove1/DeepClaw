#
MAX_MODEL_CONTENT_TOKENS = 1024 * 1024  # 1M tokens
# retry
MAX_RETRY_COUNT = 3

# context / compaction (messages)
CONTEXT_LIMIT = 50000
PERSIST_THRESHOLD = 30000
PREVIEW_CHARS = 2000
KEEP_RECENT_TOOL_RESULTS = 3
PERSIST_MAX_CAPTURE_CHARS = 5_000_000
SHORT_TOOL_RESULT_CHAR_LIMIT = 120
MICRO_COMPACTION_TRIGGER_TOKENS = int(MAX_MODEL_CONTENT_TOKENS * 0.5)
AUTO_COMPACTION_TRIGGER_TOKENS = int(MAX_MODEL_CONTENT_TOKENS * 0.8)


# Anthropic Messages API (agent7)
MESSAGES_MAX_TOKENS = 8000
# Max assistant tool-use rounds before safety stop (subagent / fork).
SUBAGENT_TOOL_LOOP_MAX = 30
# Truncate logged tool stdout/stderr in the console (not API payload).
CONSOLE_TOOL_OUTPUT_MAX_CHARS = 200
# Max tool call result preview
PREVIEW_CHARS = 2000

# hooks (examples/hook.py)
HOOK_TIMEOUT = 30  # seconds
HOOK_ENV_PAYLOAD_MAX_CHARS = 10000
