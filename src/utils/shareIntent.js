import { NativeModules } from 'react-native'

const ShareIntentModule = NativeModules.ShareIntentModule

export async function consumeSharedFile() {
  if (!ShareIntentModule?.consumeSharedFile) return null

  try {
    const payload = await ShareIntentModule.consumeSharedFile()
    if (!payload) return null

    const normalized = {
      uri: typeof payload.uri === 'string' ? payload.uri : '',
      text: typeof payload.text === 'string' ? payload.text : '',
      mimeType: typeof payload.mimeType === 'string' ? payload.mimeType : '',
      name: typeof payload.name === 'string' ? payload.name : '',
    }

    if (!normalized.uri && !normalized.text) return null
    return normalized
  } catch {
    return null
  }
}
