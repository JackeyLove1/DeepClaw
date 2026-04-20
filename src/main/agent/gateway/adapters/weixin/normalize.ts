import type { InboundMedia, InboundMessage } from '../../types'
import type { WeixinMessage, WeixinMessageItem } from './protocol'

const WEIXIN_USER_MESSAGE_TYPE = 1
const WEIXIN_TEXT_ITEM_TYPE = 1
const WEIXIN_IMAGE_ITEM_TYPE = 2
const WEIXIN_VOICE_ITEM_TYPE = 3

const extractTextFromItem = (item: WeixinMessageItem): string => {
  if (item.type === WEIXIN_TEXT_ITEM_TYPE) {
    return item.text_item?.text?.trim() ?? ''
  }
  if (item.type === WEIXIN_VOICE_ITEM_TYPE) {
    return item.voice_item?.asr_text?.trim() || item.voice_item?.text?.trim() || ''
  }
  return ''
}

const extractInboundText = (message: WeixinMessage): string => {
  const items = message.item_list ?? []
  const parts = items.map(extractTextFromItem).filter(Boolean)
  return parts.join('\n').trim()
}

const extractAudioFromItem = (item: WeixinMessageItem): InboundMedia | null => {
  if (item.type !== WEIXIN_VOICE_ITEM_TYPE) {
    return null
  }

  const voice = item.voice_item
  return {
    kind: 'audio',
    mimeType: voice?.mime_type,
    name: voice?.file_name,
    transcript: voice?.asr_text?.trim() || voice?.text?.trim() || undefined,
    sizeBytes: voice?.file_size,
    url: voice?.media?.full_url ?? voice?.media?.url ?? voice?.media?.encrypt_query_param
  }
}

const extractImageFromItem = (item: WeixinMessageItem): InboundMedia | null => {
  if (item.type !== WEIXIN_IMAGE_ITEM_TYPE) {
    return null
  }

  const image = item.image_item
  return {
    kind: 'image',
    mimeType: image?.mime_type,
    name: image?.file_name,
    sizeBytes: image?.file_size,
    url: image?.media?.full_url ?? image?.url ?? image?.media?.url ?? image?.media?.encrypt_query_param
  }
}

const extractInboundMedia = (message: WeixinMessage): InboundMedia[] => {
  const items = message.item_list ?? []
  return items
    .map((item) => extractAudioFromItem(item) ?? extractImageFromItem(item))
    .filter((item): item is InboundMedia => item !== null)
}

export const normalizeWeixinInbound = (params: {
  accountId: string
  channel: string
  message: WeixinMessage
}): InboundMessage | null => {
  const { accountId, channel, message } = params
  if (message.message_type != null && message.message_type !== WEIXIN_USER_MESSAGE_TYPE) {
    return null
  }

  const senderId = message.from_user_id?.trim()
  if (!senderId) {
    return null
  }

  const text = extractInboundText(message)
  const media = extractInboundMedia(message)
  return {
    text,
    senderId,
    channel,
    accountId,
    peerId: senderId,
    isGroup: Boolean(message.group_id?.trim()),
    media,
    raw: {
      messageId: message.message_id,
      toUserId: message.to_user_id,
      contextToken: message.context_token,
      createTimeMs: message.create_time_ms,
      source: message
    }
  }
}
