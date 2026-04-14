import type {
  AssistantCompletedEvent,
  AssistantDeltaEvent,
  AssistantStartedEvent,
  ChatEvent,
  SessionMeta,
  SessionSnapshot,
  ToolCalledEvent,
  ToolCompletedEvent
} from '@shared/models'

export type ToolCallView = {
  id: string
  name: string
  status: 'running' | 'completed' | 'error'
  argsSummary: string
  outputSummary: string
  startedAt: number
  finishedAt?: number
  durationMs?: number
}

export type ToolGroupView = {
  id: string
  status: 'running' | 'completed' | 'error'
  startedAt: number
  finishedAt?: number
  totalDurationMs: number
  summary: string
  calls: ToolCallView[]
}

export type UserTranscriptEntry = {
  kind: 'user'
  id: string
  text: string
  createdAt: number
}

export type AssistantTranscriptEntry = {
  kind: 'assistant'
  id: string
  text: string
  createdAt: number
  completedAt?: number
  isStreaming: boolean
  toolGroup?: ToolGroupView
}

export type SystemTranscriptEntry = {
  kind: 'system'
  id: string
  text: string
  tone: 'error' | 'muted'
  createdAt: number
}

export type TranscriptEntry =
  | UserTranscriptEntry
  | AssistantTranscriptEntry
  | SystemTranscriptEntry

export type ChatViewState = {
  meta: SessionMeta | null
  transcript: TranscriptEntry[]
  appliedEventIds: Set<string>
  error: string | null
  isRunning: boolean
  isCancelling: boolean
}

export type ChatViewAction =
  | { type: 'snapshot.loaded'; snapshot: SessionSnapshot }
  | { type: 'event.received'; event: ChatEvent }
  | { type: 'run.requested' }
  | { type: 'cancel.requested' }
  | { type: 'error.cleared' }

export const createInitialChatViewState = (): ChatViewState => ({
  meta: null,
  transcript: [],
  appliedEventIds: new Set<string>(),
  error: null,
  isRunning: false,
  isCancelling: false
})

const summarizeToolGroup = (group: ToolGroupView): string => {
  if (group.calls.length === 0) {
    return 'No tool output'
  }

  const failures = group.calls.filter((call) => call.status === 'error').length
  if (failures > 0) {
    return `${group.calls.length} tools, ${failures} error${failures === 1 ? '' : 's'}`
  }

  return `${group.calls.length} tool${group.calls.length === 1 ? '' : 's'} executed`
}

const getAssistantIndex = (state: ChatViewState, messageId: string): number =>
  state.transcript.findIndex((entry) => entry.kind === 'assistant' && entry.id === messageId)

const ensureAssistant = (state: ChatViewState, event: AssistantStartedEvent): ChatViewState => {
  if (getAssistantIndex(state, event.messageId) >= 0) {
    return state
  }

  return {
    ...state,
    transcript: [
      ...state.transcript,
      {
        kind: 'assistant',
        id: event.messageId,
        text: '',
        createdAt: event.timestamp,
        isStreaming: true
      }
    ]
  }
}

const updateAssistant = (
  state: ChatViewState,
  messageId: string,
  updater: (entry: AssistantTranscriptEntry) => AssistantTranscriptEntry
): ChatViewState => {
  const index = getAssistantIndex(state, messageId)
  if (index < 0) {
    return state
  }

  const nextTranscript = [...state.transcript]
  nextTranscript[index] = updater(nextTranscript[index] as AssistantTranscriptEntry)
  return { ...state, transcript: nextTranscript }
}

const applyAssistantDelta = (state: ChatViewState, event: AssistantDeltaEvent): ChatViewState => {
  const prepared = ensureAssistant(state, {
    type: 'assistant.started',
    eventId: `${event.eventId}_bootstrap`,
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    messageId: event.messageId
  })

  return updateAssistant(prepared, event.messageId, (entry) => ({
    ...entry,
    text: entry.text + event.delta,
    isStreaming: true
  }))
}

const applyAssistantCompleted = (
  state: ChatViewState,
  event: AssistantCompletedEvent
): ChatViewState => {
  const prepared = ensureAssistant(state, {
    type: 'assistant.started',
    eventId: `${event.eventId}_bootstrap`,
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    messageId: event.messageId
  })

  return updateAssistant(prepared, event.messageId, (entry) => ({
    ...entry,
    text: event.text || entry.text,
    completedAt: event.timestamp,
    isStreaming: false,
    toolGroup: entry.toolGroup
      ? {
          ...entry.toolGroup,
          status: entry.toolGroup.status === 'error' ? 'error' : 'completed',
          finishedAt: event.timestamp,
          summary: summarizeToolGroup(entry.toolGroup)
        }
      : entry.toolGroup
  }))
}

const ensureToolGroup = (state: ChatViewState, event: Extract<ChatEvent, { type: 'tool.group.started' }>): ChatViewState =>
  updateAssistant(state, event.assistantMessageId, (entry) => ({
    ...entry,
    toolGroup: entry.toolGroup ?? {
      id: event.groupId,
      status: 'running',
      startedAt: event.timestamp,
      totalDurationMs: 0,
      summary: 'Running tools',
      calls: []
    }
  }))

const applyToolCalled = (state: ChatViewState, event: ToolCalledEvent): ChatViewState => {
  const prepared = ensureToolGroup(state, {
    type: 'tool.group.started',
    eventId: `${event.eventId}_group`,
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    assistantMessageId: event.assistantMessageId,
    groupId: event.groupId
  })

  return updateAssistant(prepared, event.assistantMessageId, (entry) => {
    if (!entry.toolGroup) {
      return entry
    }

    const existingCall = entry.toolGroup.calls.find((call) => call.id === event.toolCallId)
    if (existingCall) {
      return entry
    }

    const nextGroup: ToolGroupView = {
      ...entry.toolGroup,
      status: 'running',
      summary: 'Running tools',
      calls: [
        ...entry.toolGroup.calls,
        {
          id: event.toolCallId,
          name: event.toolName,
          status: 'running',
          argsSummary: event.argsSummary,
          outputSummary: '',
          startedAt: event.timestamp
        }
      ]
    }

    return { ...entry, toolGroup: nextGroup }
  })
}

const applyToolCompleted = (state: ChatViewState, event: ToolCompletedEvent): ChatViewState =>
  updateAssistant(state, event.assistantMessageId, (entry) => {
    if (!entry.toolGroup) {
      return entry
    }

    const calls: ToolCallView[] = entry.toolGroup.calls.map((call) => {
      if (call.id !== event.toolCallId) {
        return call
      }

      return {
        ...call,
        status: event.isError ? ('error' as const) : ('completed' as const),
        outputSummary: event.outputSummary,
        finishedAt: event.timestamp,
        durationMs: event.durationMs
      }
    })

    const status = calls.some((call) => call.status === 'error')
      ? 'error'
      : calls.some((call) => call.status === 'running')
        ? 'running'
        : 'completed'

    const totalDurationMs = calls.reduce((total, call) => total + (call.durationMs ?? 0), 0)
    const nextGroup: ToolGroupView = {
      ...entry.toolGroup,
      calls,
      status,
      totalDurationMs,
      finishedAt: status === 'running' ? undefined : event.timestamp
    }
    nextGroup.summary = summarizeToolGroup(nextGroup)

    return { ...entry, toolGroup: nextGroup }
  })

export const applyChatEvent = (state: ChatViewState, event: ChatEvent): ChatViewState => {
  if (state.appliedEventIds.has(event.eventId)) {
    return state
  }

  const nextAppliedIds = new Set(state.appliedEventIds)
  nextAppliedIds.add(event.eventId)
  let nextState: ChatViewState = { ...state, appliedEventIds: nextAppliedIds }

  switch (event.type) {
    case 'session.created':
      nextState.meta = event.meta
      return nextState

    case 'user.message':
      nextState.error = null
      nextState.isRunning = true
      nextState.isCancelling = false
      nextState.meta = nextState.meta
        ? {
            ...nextState.meta,
            updatedAt: event.timestamp,
            status: 'running',
            messageCount: nextState.meta.messageCount + 1
          }
        : nextState.meta
      nextState.transcript = [
        ...nextState.transcript,
        {
          kind: 'user',
          id: event.messageId,
          text: event.text,
          createdAt: event.timestamp
        }
      ]
      return nextState

    case 'assistant.started':
      nextState.isRunning = true
      nextState.meta = nextState.meta
        ? {
            ...nextState.meta,
            status: 'running',
            updatedAt: event.timestamp
          }
        : nextState.meta
      return ensureAssistant(nextState, event)

    case 'assistant.delta':
      return applyAssistantDelta(nextState, event)

    case 'tool.group.started':
      return ensureToolGroup(nextState, event)

    case 'tool.called':
      return applyToolCalled(nextState, event)

    case 'tool.completed':
      return applyToolCompleted(nextState, event)

    case 'assistant.completed':
      nextState.isRunning = false
      nextState.isCancelling = false
      nextState.meta = nextState.meta
        ? {
            ...nextState.meta,
            updatedAt: event.timestamp,
            status: 'idle',
            messageCount: nextState.meta.messageCount + 1
          }
        : nextState.meta
      return applyAssistantCompleted(nextState, event)

    case 'session.title.updated':
      nextState.meta = nextState.meta
        ? {
            ...nextState.meta,
            title: event.title,
            updatedAt: event.timestamp
          }
        : nextState.meta
      return nextState

    case 'session.error':
      nextState.error = event.message
      nextState.isRunning = false
      nextState.isCancelling = false
      nextState.meta = nextState.meta
        ? {
            ...nextState.meta,
            status: 'error',
            updatedAt: event.timestamp
          }
        : nextState.meta
      nextState.transcript = [
        ...nextState.transcript,
        {
          kind: 'system',
          id: event.eventId,
          text: event.message,
          tone: 'error',
          createdAt: event.timestamp
        }
      ]
      return nextState

    case 'session.cancelled':
      nextState.isRunning = false
      nextState.isCancelling = false
      nextState.meta = nextState.meta
        ? {
            ...nextState.meta,
            status: 'cancelled',
            updatedAt: event.timestamp
          }
        : nextState.meta
      return {
        ...nextState,
        transcript: [
          ...nextState.transcript,
          {
            kind: 'system',
            id: event.eventId,
            text: 'The current run was cancelled.',
            tone: 'muted',
            createdAt: event.timestamp
          }
        ]
      }
  }
}

export const replaySession = (snapshot: SessionSnapshot): ChatViewState => {
  let state = createInitialChatViewState()

  for (const event of snapshot.events) {
    state = applyChatEvent(state, event)
  }

  state.meta = snapshot.meta
  return state
}

export const selectVisibleSessions = (sessions: SessionMeta[], limit = 10): SessionMeta[] =>
  [...sessions].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, limit)

export const chatViewReducer = (state: ChatViewState, action: ChatViewAction): ChatViewState => {
  switch (action.type) {
    case 'snapshot.loaded':
      return replaySession(action.snapshot)

    case 'event.received':
      return applyChatEvent(state, action.event)

    case 'run.requested':
      return { ...state, error: null, isRunning: true, isCancelling: false }

    case 'cancel.requested':
      return { ...state, isCancelling: true }

    case 'error.cleared':
      return { ...state, error: null }
  }
}
