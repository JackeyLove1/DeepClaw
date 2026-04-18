import process from 'node:process'
import type { RuntimeConfig } from './types'

type RuntimeConfigValidation = { ok: true; config: RuntimeConfig } | { ok: false; message: string }

const getBaseUrl = (): string | undefined => process.env.ANTHROPIC_BASE_URL?.trim() || undefined

export const validateRuntimeConfig = (): RuntimeConfigValidation => {
  const provider = process.env.NOTEMARK_MODEL_PROVIDER?.trim() || 'anthropic'
  const model = process.env.NOTEMARK_MODEL?.trim() || ''

  if (provider !== 'anthropic') {
    return {
      ok: false,
      message:
        'Chat runtime only supports Anthropic-compatible channels. Save an active AI channel and retry.'
    }
  }

  if (!model) {
    return { ok: false, message: 'Chat runtime is missing NOTEMARK_MODEL for the active AI channel.' }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      message:
        'Chat runtime is missing ANTHROPIC_API_KEY for the active AI channel. Save your settings and test the connection.'
    }
  }

  return { ok: true, config: { provider: 'anthropic', model, baseUrl: getBaseUrl() } }
}

export const resolveRuntimeConfig = (): RuntimeConfig => {
  const result = validateRuntimeConfig()
  if (!result.ok) {
    throw new Error(result.message)
  }

  return result.config
}

export const getAnthropicApiKey = (): string | undefined => process.env.ANTHROPIC_API_KEY
