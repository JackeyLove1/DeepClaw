export type NoteInfo = {
  title: string
  lastEditTime: number
}

export type NoteContent = string

export type SessionStatus = 'idle' | 'running' | 'error' | 'cancelled'

export type SessionMeta = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
  status: SessionStatus
}

export type ChatEventBase = {
  eventId: string
  sessionId: string
  timestamp: number
}

export type ChatImageAttachment = {
  id: string
  fileName: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  filePath: string
  sizeBytes: number
  width: number
  height: number
}

export type ChatCanvasArtifact = {
  kind: 'canvas'
  id: string
  title: string
  fileName: string
  mimeType: 'text/html'
  filePath: string
  sizeBytes: number
  createdAt: number
}

export type ChatToolArtifact = ChatImageAttachment | ChatCanvasArtifact

export type SessionCreatedEvent = ChatEventBase & {
  type: 'session.created'
  meta: SessionMeta
}

export type UserMessageEvent = ChatEventBase & {
  type: 'user.message'
  messageId: string
  text: string
  attachments?: ChatImageAttachment[]
}

export type AssistantStartedEvent = ChatEventBase & {
  type: 'assistant.started'
  messageId: string
}

export type AssistantDeltaEvent = ChatEventBase & {
  type: 'assistant.delta'
  messageId: string
  delta: string
}

export type ToolGroupStartedEvent = ChatEventBase & {
  type: 'tool.group.started'
  assistantMessageId: string
  groupId: string
}

export type ToolCalledEvent = ChatEventBase & {
  type: 'tool.called'
  assistantMessageId: string
  groupId: string
  requestRound: number
  toolCallId: string
  toolName: string
  argsSummary: string
}

export type ToolValidationStatus = 'skipped' | 'passed' | 'failed_schema' | 'failed_semantic'

export type ToolCompletedEvent = ChatEventBase & {
  type: 'tool.completed'
  assistantMessageId: string
  groupId: string
  requestRound: number
  toolCallId: string
  toolName: string
  outputSummary: string
  durationMs: number
  isError: boolean
  roundInputTokens: number
  roundOutputTokens: number
  roundCacheCreationTokens: number
  roundCacheReadTokens: number
  roundToolCallCount: number
  artifacts?: ChatToolArtifact[]
  errorCode?: string
  errorType?: string
  failureStage?: string
  validationStatus?: ToolValidationStatus
  attemptCount?: number
  retryCount?: number
  selfHealCount?: number
  fallbackUsed?: boolean
  fallbackStrategy?: string
}

export type AssistantApiUsage = {
  requestRound: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  timestamp: number
}

export type ProviderTranscriptMessage = {
  role: 'user' | 'assistant'
  content: unknown
}

export type AssistantCompletedEvent = ChatEventBase & {
  type: 'assistant.completed'
  messageId: string
  text: string
  durationMs: number
  apiUsages?: AssistantApiUsage[]
  reasoningText?: string
  providerTranscript?: ProviderTranscriptMessage[]
}

export type SessionTitleUpdatedEvent = ChatEventBase & {
  type: 'session.title.updated'
  title: string
}

export type SessionErrorEvent = ChatEventBase & {
  type: 'session.error'
  message: string
}

export type SessionCancelledEvent = ChatEventBase & {
  type: 'session.cancelled'
}

export type CronDeliveryEvent = ChatEventBase & {
  type: 'cron.delivery'
  jobId: string
  runId: string
  jobName: string
  status: 'success' | 'error'
  deliverTarget: 'origin_session'
  text: string
}

export type ChatEvent =
  | SessionCreatedEvent
  | UserMessageEvent
  | AssistantStartedEvent
  | AssistantDeltaEvent
  | ToolGroupStartedEvent
  | ToolCalledEvent
  | ToolCompletedEvent
  | AssistantCompletedEvent
  | SessionTitleUpdatedEvent
  | SessionErrorEvent
  | SessionCancelledEvent
  | CronDeliveryEvent

export type ToolCallEvent = ToolCalledEvent | ToolCompletedEvent

export type AssistantTurnState = {
  assistantMessageId: string
  text: string
  status: 'streaming' | 'completed' | 'error' | 'cancelled'
  toolGroup?: {
    groupId: string
    status: 'running' | 'completed' | 'error'
    toolCount: number
    totalDurationMs: number
    summary: string
  }
}

export type SessionSnapshot = {
  meta: SessionMeta
  events: ChatEvent[]
}
