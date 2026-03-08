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
import { findMatchingDraft, loadDrafts, loadSettings } from '../utils/storage'
import { listRepoPosts, fetchRepoPost } from '../utils/gitlab'
import { useAppTheme } from '../utils/theme'
import { getSiteTheme } from '../utils/siteThemes'

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
  const theme = useAppTheme()
  const colors = theme.colors
  const styles = useMemo(() => createStyles(colors), [colors])
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
  const currentSiteTheme = getSiteTheme(currentSite?.id || siteId)

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
    const drafts = await loadDrafts()
    const existingDraft = findMatchingDraft(drafts, {
      remoteProvider: provider,
      remotePath: post.path,
      repoSiteId: currentSite.id,
    })

    const openRemote = async () => {
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

    if (existingDraft) {
      Alert.alert(
        'Resume local draft?',
        'This repo post already has autosaved edits on your device.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reload Repo Copy', onPress: openRemote },
          { text: 'Resume Draft', onPress: () => navigation.navigate('PostEditor', { draft: existingDraft }) },
        ]
      )
      return
    }

    openRemote()
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
          <View style={styles.postTitleWrap}>
            <View style={[styles.siteDot, { backgroundColor: currentSiteTheme.color }]} />
            <Text style={styles.postName} numberOfLines={1}>{item.name}</Text>
          </View>
          {busy ? (
            <ActivityIndicator size="small" color={currentSiteTheme.color} />
          ) : (
            <Ionicons name="open-outline" size={18} color={currentSiteTheme.color} />
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
          <Ionicons name="arrow-back" size={24} color={colors.headerText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Browse Repo</Text>
        <TouchableOpacity
          onPress={handleLoadPosts}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="refresh-outline" size={22} color={colors.headerText} />
        </TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <Text style={[styles.heroEyebrow, { color: currentSiteTheme.color }]}>
          {currentSiteTheme.label}
        </Text>
        <Text style={styles.heroTitle}>{currentSiteTheme.title}</Text>
        <Text style={styles.heroBody}>
          {currentSiteTheme.subtitle}. Load the repo files, then open one directly in the editor.
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
              {(settings?.sites || []).map(site => {
                const siteTheme = getSiteTheme(site.id)
                return (
                  <TouchableOpacity
                    key={site.id}
                    style={[
                      styles.siteCard,
                      siteId === site.id && styles.siteCardActive,
                      siteId === site.id && { borderColor: siteTheme.color, backgroundColor: `${siteTheme.color}18` },
                    ]}
                    onPress={() => setSiteId(site.id)}
                  >
                    <Text style={[styles.siteCardEyebrow, { color: siteTheme.color }]}>
                      {siteTheme.label}
                    </Text>
                    <Text style={[styles.siteCardTitle, siteId === site.id && styles.siteCardTitleActive]}>
                      {siteTheme.title}
                    </Text>
                    <Text style={styles.siteCardSubtitle} numberOfLines={2}>{siteTheme.subtitle}</Text>
                    <Text style={styles.siteCardPath} numberOfLines={2}>{site.path}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <TouchableOpacity
              style={[
                styles.loadBtn,
                { backgroundColor: currentSiteTheme.color },
                (!settings || loading) && styles.loadBtnDisabled,
              ]}
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
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {filteredPosts.length > 0 ? (
              <Text style={styles.resultsLabel}>
                {filteredPosts.length} {currentSiteTheme.label} post{filteredPosts.length !== 1 ? 's' : ''} available
              </Text>
            ) : null}
          </View>
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={54} color={colors.textSoft} />
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

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.header,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: colors.headerText, fontSize: 22, fontWeight: '700' },
  hero: {
    backgroundColor: colors.hero,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  heroEyebrow: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 6,
  },
  heroTitle: { color: colors.textStrong, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  heroBody: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 8 },
  content: { padding: 18, gap: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chipRow: { flexDirection: 'row', gap: 10 },
  providerChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
  },
  providerChipText: { color: colors.text, fontWeight: '600' },
  siteGrid: { gap: 10 },
  siteCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 14,
  },
  siteCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceMuted,
  },
  siteCardTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  siteCardTitleActive: { color: colors.accent },
  siteCardPath: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  loadBtn: {
    backgroundColor: colors.accent,
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
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.inputText,
  },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  resultsLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  listContent: { paddingBottom: 32 },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  emptyBody: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  postCard: {
    marginHorizontal: 18,
    marginBottom: 10,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  postTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  siteDot: { width: 10, height: 10, borderRadius: 999 },
  postName: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  siteCardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  postPath: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  siteCardSubtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 8 },
})
