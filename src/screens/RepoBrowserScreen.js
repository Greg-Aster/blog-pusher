import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { loadSettings } from '../utils/storage'
import { listRepoPosts, fetchRepoPost } from '../utils/gitlab'

const PROVIDERS = [
  { id: 'gitlab', label: 'GitLab', color: '#fc6d26' },
  { id: 'github', label: 'GitHub', color: '#24292e' },
]

function validateProviderSettings(provider, settings) {
  const providers = settings?.providers || {}
  if (provider === 'github') {
    const github = providers.github || {}
    if (!github.token) return 'Add your GitHub token in Settings first.'
    if (!github.owner || !github.repo) return 'Set GitHub owner and repo in Settings first.'
    return null
  }

  const gitlab = providers.gitlab || {}
  if (!gitlab.token) return 'Add your GitLab token in Settings first.'
  if (!gitlab.project) return 'Set your GitLab project path in Settings first.'
  return null
}

export default function RepoBrowserScreen({ navigation }) {
  const [settings, setSettings] = useState(null)
  const [provider, setProvider] = useState('gitlab')
  const [siteId, setSiteId] = useState('temporal')
  const [posts, setPosts] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [openingId, setOpeningId] = useState(null)
  const [error, setError] = useState('')

  const loadSavedSettings = useCallback(async () => {
    const next = await loadSettings()
    setSettings(next)
    if (!next?.sites?.some(site => site.id === siteId)) {
      setSiteId(next?.sites?.[0]?.id || 'temporal')
    }
  }, [siteId])

  useFocusEffect(
    useCallback(() => {
      loadSavedSettings()
    }, [loadSavedSettings])
  )

  const currentSite = settings?.sites?.find(site => site.id === siteId) || settings?.sites?.[0]

  const filteredPosts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return posts
    return posts.filter(post => {
      const name = String(post.name || '').toLowerCase()
      const path = String(post.path || '').toLowerCase()
      return name.includes(needle) || path.includes(needle)
    })
  }, [posts, query])

  useEffect(() => {
    setPosts([])
    setError('')
    setQuery('')
  }, [provider, siteId])

  async function handleLoadPosts() {
    if (!settings || !currentSite) return

    const providerError = validateProviderSettings(provider, settings)
    if (providerError) {
      Alert.alert('Provider not configured', providerError, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => navigation.navigate('Settings') },
      ])
      return
    }

    setLoading(true)
    setError('')
    setPosts([])
    const result = await listRepoPosts(settings, currentSite.path, provider)
    if (result.ok) {
      setPosts(result.posts || [])
      if (!result.posts?.length) {
        setError('No Markdown posts found in that site path.')
      }
    } else {
      setError(result.error || 'Could not load repository posts.')
    }
    setLoading(false)
  }

  async function handleOpenPost(post) {
    if (!settings || !currentSite) return
    setOpeningId(post.id)
    const result = await fetchRepoPost(settings, provider, post.path)
    setOpeningId(null)

    if (!result.ok) {
      Alert.alert('Could not open post', result.error || 'Unknown error.')
      return
    }

    navigation.navigate('PostEditor', {
      raw: result.raw,
      filename: post.name,
      siteId: currentSite.id,
      destination: provider,
      remoteFile: result.remoteFile,
    })
  }

  function renderPost({ item }) {
    const busy = openingId === item.id
    return (
      <TouchableOpacity
        style={styles.postCard}
        onPress={() => handleOpenPost(item)}
        activeOpacity={0.8}
        disabled={busy}
      >
        <View style={styles.postHeader}>
          <Text style={styles.postName} numberOfLines={1}>{item.name}</Text>
          {busy ? (
            <ActivityIndicator size="small" color="#2d6a4f" />
          ) : (
            <Ionicons name="open-outline" size={18} color="#2d6a4f" />
          )}
        </View>
        <Text style={styles.postPath} numberOfLines={2}>{item.path}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Browse Repo</Text>
        <TouchableOpacity
          onPress={handleLoadPosts}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="refresh-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>Remote Editing</Text>
        <Text style={styles.heroTitle}>Open a post from your repo and edit it on-device.</Text>
        <Text style={styles.heroBody}>
          Pick a provider and site path, load the repo files, then open one directly in the editor.
        </Text>
      </View>

      <FlatList
        data={filteredPosts}
        keyExtractor={item => item.id}
        renderItem={renderPost}
        ListHeaderComponent={
          <View style={styles.content}>
            <Text style={styles.sectionLabel}>Provider</Text>
            <View style={styles.chipRow}>
              {PROVIDERS.map(option => (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.providerChip,
                    provider === option.id && {
                      backgroundColor: option.color,
                      borderColor: option.color,
                    },
                  ]}
                  onPress={() => setProvider(option.id)}
                >
                  <Text
                    style={[
                      styles.providerChipText,
                      provider === option.id && { color: '#fff' },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Site</Text>
            <View style={styles.siteGrid}>
              {(settings?.sites || []).map(site => (
                <TouchableOpacity
                  key={site.id}
                  style={[styles.siteCard, siteId === site.id && styles.siteCardActive]}
                  onPress={() => setSiteId(site.id)}
                >
                  <Text style={[styles.siteCardTitle, siteId === site.id && styles.siteCardTitleActive]}>
                    {site.name}
                  </Text>
                  <Text style={styles.siteCardPath} numberOfLines={2}>{site.path}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.loadBtn, (!settings || loading) && styles.loadBtnDisabled]}
              onPress={handleLoadPosts}
              disabled={!settings || loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="folder-open-outline" size={18} color="#fff" />
              )}
              <Text style={styles.loadBtnText}>{loading ? 'Loading Posts...' : 'Load Posts'}</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search filenames or paths"
              placeholderTextColor="#8fa196"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {filteredPosts.length > 0 ? (
              <Text style={styles.resultsLabel}>
                {filteredPosts.length} post{filteredPosts.length !== 1 ? 's' : ''} available
              </Text>
            ) : null}
          </View>
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={54} color="#c3cec6" />
              <Text style={styles.emptyTitle}>No posts loaded yet</Text>
              <Text style={styles.emptyBody}>
                Load the selected repo path to browse remote Markdown files.
              </Text>
            </View>
          )
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f2ec' },
  header: {
    backgroundColor: '#163329',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  hero: {
    backgroundColor: '#efe7d8',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#e1d7c5',
  },
  heroEyebrow: {
    color: '#8b5e34',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 6,
  },
  heroTitle: { color: '#2b2318', fontSize: 22, fontWeight: '700', lineHeight: 28 },
  heroBody: { color: '#655647', fontSize: 14, lineHeight: 20, marginTop: 8 },
  content: { padding: 18, gap: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6a756f',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chipRow: { flexDirection: 'row', gap: 10 },
  providerChip: {
    borderWidth: 1,
    borderColor: '#d0d8d3',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  providerChipText: { color: '#304037', fontWeight: '600' },
  siteGrid: { gap: 10 },
  siteCard: {
    borderWidth: 1,
    borderColor: '#d6ddd6',
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 14,
  },
  siteCardActive: {
    borderColor: '#2d6a4f',
    backgroundColor: '#eef6f1',
  },
  siteCardTitle: { color: '#1d2b24', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  siteCardTitleActive: { color: '#1d5a3f' },
  siteCardPath: { color: '#79867f', fontSize: 12, lineHeight: 17 },
  loadBtn: {
    backgroundColor: '#2d6a4f',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  loadBtnDisabled: { opacity: 0.7 },
  loadBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  searchInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d6ddd6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#1d2b24',
  },
  errorText: { color: '#ad2f2f', fontSize: 13, lineHeight: 18 },
  resultsLabel: {
    color: '#6a756f',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  listContent: { paddingBottom: 32 },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  emptyTitle: { color: '#435147', fontSize: 18, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  emptyBody: { color: '#829087', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  postCard: {
    marginHorizontal: 18,
    marginBottom: 10,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dde4de',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  postName: { flex: 1, color: '#1d2b24', fontSize: 16, fontWeight: '700' },
  postPath: { color: '#78847d', fontSize: 12, lineHeight: 18 },
})
