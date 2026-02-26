import AsyncStorage from '@react-native-async-storage/async-storage'

const KEYS = {
  SETTINGS: 'settings',
  QUEUE: 'queue',
}

const DEFAULT_SETTINGS = {
  token: '',
  project: 'Greg.Aster/merkin',
  sites: [
    { id: 'temporal', name: 'Temporal Flow', path: 'Temporal-Flow/src/content/posts' },
    { id: 'dndiy', name: 'DNDIY', path: 'DNDIY.github.io/src/content/posts' },
    { id: 'travel', name: 'Trail Log', path: 'apps/travel/src/content/posts' },
    { id: 'megameal', name: 'MEGAMEAL', path: 'MEGAMEAL/src/content/posts' },
  ],
}

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SETTINGS)
    if (!raw) return DEFAULT_SETTINGS
    const saved = JSON.parse(raw)
    return { ...DEFAULT_SETTINGS, ...saved }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(settings) {
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings))
}

export async function loadQueue() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.QUEUE)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export async function addToQueue(item) {
  const queue = await loadQueue()
  queue.unshift(item)
  await AsyncStorage.setItem(KEYS.QUEUE, JSON.stringify(queue))
}

export async function removeFromQueue(id) {
  const queue = await loadQueue()
  const updated = queue.filter(i => i.id !== id)
  await AsyncStorage.setItem(KEYS.QUEUE, JSON.stringify(updated))
}
