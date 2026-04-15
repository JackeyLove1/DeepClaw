import type { AssistantTranscriptEntry, TranscriptEntry } from './reducer'

export type AssistantFeedback = 'up' | 'down' | null

export const getLatestAssistantMessageId = (transcript: TranscriptEntry[]): string | null => {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const entry = transcript[index]
    if (entry.kind === 'assistant') {
      return entry.id
    }
  }

  return null
}

export const buildFeedbackKey = (sessionId: string, assistantMessageId: string): string =>
  `${sessionId}:${assistantMessageId}`

export const toggleAssistantFeedback = (
  prev: Record<string, AssistantFeedback>,
  key: string,
  next: Exclude<AssistantFeedback, null>
): Record<string, AssistantFeedback> => ({
  ...prev,
  [key]: prev[key] === next ? null : next
})

export const getRetryPromptForAssistant = (
  transcript: TranscriptEntry[],
  assistantMessageId: string
): string | null => {
  const assistantIndex = transcript.findIndex(
    (entry) => entry.kind === 'assistant' && entry.id === assistantMessageId
  )
  if (assistantIndex <= 0) {
    return null
  }

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const entry = transcript[index]
    if (entry.kind === 'user') {
      const prompt = entry.text.trim()
      return prompt.length > 0 ? prompt : null
    }
  }

  return null
}

const copyByTextAreaFallback = (text: string): boolean => {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

export const copyAssistantMessage = async (message: AssistantTranscriptEntry): Promise<boolean> => {
  const text = message.text.trim()
  if (!text) {
    return false
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Ignore and fallback to legacy clipboard flow.
  }

  return copyByTextAreaFallback(text)
}
