import AsyncStorage from '@react-native-async-storage/async-storage'

const KEYS = {
  SETTINGS: 'settings',
  QUEUE: 'queue',
  DRAFTS: 'drafts',
}

const DEFAULT_SETTINGS = {
  providers: {
    gitlab: {
      token: '',
      project: 'Greg.Aster/merkin',
      branch: 'main',
    },
    github: {
      token: '',
      owner: '',
      repo: '',
      branch: 'main',
    },
  },
  sites: [
    { id: 'temporal', name: 'Temporal Flow', path: 'Temporal-Flow/src/content/posts' },
    { id: 'dndiy', name: 'DNDIY', path: 'DNDIY.github.io/src/content/posts' },
    { id: 'travel', name: 'Trail Log', path: 'apps/travel/src/content/posts' },
    { id: 'megameal', name: 'MEGAMEAL', path: 'MEGAMEAL/src/content/posts' },
  ],
}

function normalizeSettings(saved = {}) {
  const providers = {
    gitlab: {
      ...DEFAULT_SETTINGS.providers.gitlab,
      ...(saved.providers?.gitlab || {}),
    },
    github: {
      ...DEFAULT_SETTINGS.providers.github,
      ...(saved.providers?.github || {}),
    },
  }

  // Backward compatibility with legacy top-level fields.
  if (!providers.gitlab.token && typeof saved.token === 'string') {
    providers.gitlab.token = saved.token
  }
  if (!providers.gitlab.project && typeof saved.project === 'string') {
    providers.gitlab.project = saved.project
  }

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    providers,
    // Keep legacy aliases so older screens keep working.
    token: providers.gitlab.token,
    project: providers.gitlab.project,
    sites: Array.isArray(saved.sites) ? saved.sites : DEFAULT_SETTINGS.sites,
  }
}

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SETTINGS)
    if (!raw) return normalizeSettings()
    const saved = JSON.parse(raw)
    return normalizeSettings(saved)
  } catch {
    return normalizeSettings()
  }
}

export async function saveSettings(settings) {
  const normalized = normalizeSettings(settings)
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(normalized))
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

export async function updateQueueItem(id, updates) {
  const queue = await loadQueue()
  const idx = queue.findIndex(i => i.id === id)
  if (idx === -1) return
  queue[idx] = { ...queue[idx], ...updates }
  await AsyncStorage.setItem(KEYS.QUEUE, JSON.stringify(queue))
}

// ---------------------------------------------------------------------------
// Drafts — local autosave for the editor
// ---------------------------------------------------------------------------

export async function loadDrafts() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.DRAFTS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export async function saveDraft(draft) {
  const drafts = await loadDrafts()
  const idx = drafts.findIndex(d => d.id === draft.id)
  const updated = { ...draft, updatedAt: new Date().toISOString() }
  if (idx >= 0) {
    drafts[idx] = updated
  } else {
    drafts.unshift(updated)
  }
  await AsyncStorage.setItem(KEYS.DRAFTS, JSON.stringify(drafts))
}

export async function loadDraft(id) {
  const drafts = await loadDrafts()
  return drafts.find(d => d.id === id) || null
}

export async function deleteDraft(id) {
  const drafts = await loadDrafts()
  const updated = drafts.filter(d => d.id !== id)
  await AsyncStorage.setItem(KEYS.DRAFTS, JSON.stringify(updated))
}
