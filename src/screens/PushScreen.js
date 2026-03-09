import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { loadSettings, removeFromQueue, updateQueueItem } from '../utils/storage'
import { publishFile, publishImage, getImageUploadDirectory, listRepoPosts } from '../utils/gitlab'
import { normalizeYamlDateScalars } from '../utils/frontmatter'
import { useAppTheme } from '../utils/theme'
import { getSiteTheme } from '../utils/siteThemes'

const PROVIDERS = [
  { id: 'gitlab', label: 'GitLab', color: '#fc6d26' },
  { id: 'github', label: 'GitHub', color: '#24292e' },
]

function validateProviderSettings(provider, settings) {
  const providers = settings.providers || {}
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

function normalizeRepoPath(path) {
  return String(path || '').trim().replace(/^\/+|\/+$/g, '')
}

function remotePathMatchesSite(remotePath, sitePath) {
  const normalizedRemote = normalizeRepoPath(remotePath)
  const normalizedSite = normalizeRepoPath(sitePath)
  if (!normalizedRemote || !normalizedSite) return true
  return normalizedRemote === normalizedSite || normalizedRemote.startsWith(`${normalizedSite}/`)
}

function getPathStem(path) {
  const normalized = normalizeRepoPath(path)
  const basename = normalized.split('/').pop() || normalized
  return basename.replace(/\.[^.]+$/, '').toLowerCase()
}

export default function PushScreen({ navigation, route }) {
  const theme = useAppTheme()
  const colors = theme.colors
  const styles = useMemo(() => createStyles(colors), [colors])
  const { item } = route.params
  const [pushing, setPushing] = useState(false)
  const [log, setLog] = useState([])
  const [destination, setDestination] = useState(item.remoteProvider || item.destination || 'gitlab')
  const [settingsSnapshot, setSettingsSnapshot] = useState(null)
  const [branchOverride, setBranchOverride] = useState('')

  useEffect(() => {
    loadSettings().then(setSettingsSnapshot)
  }, [])

  function addLog(msg, ok = true) {
    setLog(prev => [...prev, { msg, ok, id: Date.now() + Math.random() }])
  }

  function getDefaultBranch(provider, snapshot = settingsSnapshot) {
    const branch = item.remoteProvider === provider ? item.remoteBranch : snapshot?.providers?.[provider]?.branch
    const trimmed = typeof branch === 'string' ? branch.trim() : ''
    return trimmed || 'main'
  }

  async function handlePush() {
    setPushing(true)
    setLog([])

    const settings = await loadSettings()
    const trimmedBranchOverride = branchOverride.trim()
    const effectiveBranch = trimmedBranchOverride || getDefaultBranch(destination, settings)
    const settingsForPush = trimmedBranchOverride
      ? {
          ...settings,
          providers: {
            ...(settings.providers || {}),
            [destination]: {
              ...(settings.providers?.[destination] || {}),
              branch: effectiveBranch,
            },
          },
        }
      : settings
    const providerLabel = PROVIDERS.find(p => p.id === destination)?.label || destination
    const providerError = validateProviderSettings(destination, settingsForPush)
    if (providerError) {
      Alert.alert('Destination not configured', providerError, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => navigation.navigate('Settings') },
      ])
      setPushing(false)
      return
    }

    const siteConfig = settingsForPush.sites?.find(s => s.id === item.siteId)
    if (!siteConfig) {
      Alert.alert('Site not found', 'Check your site paths in Settings.')
      setPushing(false)
      return
    }

    if (item.remotePath && !remotePathMatchesSite(item.remotePath, siteConfig.path)) {
      Alert.alert(
        'Site mismatch',
        `This queued post is linked to:\n${item.remotePath}\n\nBut the selected site points to:\n${siteConfig.path}\n\nOpen the post again from the correct site instead of pushing this queue item.`
      )
      addLog(`✗ Site mismatch: ${item.remotePath} is outside ${siteConfig.path}`, false)
      setPushing(false)
      return
    }

    let allOk = true

    addLog(`Target branch: ${effectiveBranch}`)
    const imageUploadDir = getImageUploadDirectory(siteConfig.path)
    if (imageUploadDir && (item.images || []).length > 0) {
      addLog(`Image target folder: ${imageUploadDir}`)
    }

    // Push images first
    for (const img of item.images || []) {
      addLog(`Uploading image to ${providerLabel}: ${img.filename}…`)
      const result = await publishImage(img, settingsForPush, siteConfig, destination)
      if (result.ok) {
        addLog(`✓ ${img.filename} → /blog-images/${img.filename}`)
      } else {
        addLog(`✗ ${img.filename}: ${result.error}`, false)
        allOk = false
      }
    }

    // Push the markdown file
    addLog(`Pushing ${item.filename} to ${providerLabel}…`)
    if (!item.content) {
      addLog('✗ No content stored. Remove from queue and add the file again.', false)
      setPushing(false)
      return
    }

    const useRemoteIdentity = !!item.remotePath && (!item.remoteProvider || item.remoteProvider === destination)

    async function doPush(publishOptions) {
      const normalizedContent = normalizeYamlDateScalars(item.content)
      if (normalizedContent !== item.content) {
        addLog('Normalized quoted YAML date fields before upload.')
        await updateQueueItem(item.id, { content: normalizedContent })
      }

      const result = await publishFile(
        item.filename,
        normalizedContent,
        settingsForPush,
        siteConfig.path,
        destination,
        publishOptions
      )
      if (result.ok) {
        addLog(`✓ Post pushed → ${result.filePath}`)
        addLog(`✓ Destination: ${providerLabel} (${effectiveBranch})`)
        await updateQueueItem(item.id, {
          destination,
          remoteProvider: destination,
          remotePath: result.filePath || item.remotePath || null,
          sourceSha: result.sha || item.sourceSha || null,
          sourceLastCommitId: item.sourceLastCommitId || null,
          remoteBranch: effectiveBranch,
        })
      } else {
        addLog(`✗ ${result.error}`, false)
        allOk = false
      }

      setPushing(false)

      if (allOk) {
        Alert.alert(
          'Push complete!',
          `Everything uploaded to ${providerLabel}. Remove from queue?`,
          [
            { text: 'Keep in queue', style: 'cancel' },
            {
              text: 'Remove',
              onPress: async () => {
                await removeFromQueue(item.id)
                navigation.goBack()
              },
            },
          ]
        )
      }
    }

    if (!useRemoteIdentity) {
      const existingPosts = await listRepoPosts(settingsForPush, siteConfig.path, destination)
      if (existingPosts.ok) {
        const targetStem = getPathStem(item.filename)
        const conflictingPost = (existingPosts.posts || []).find(post => getPathStem(post.path) === targetStem)
        if (conflictingPost) {
          addLog(`⚠ Existing repo post detected: ${conflictingPost.path}`)
          Alert.alert(
            'Post already exists',
            `A repo post with this slug already exists:\n${conflictingPost.path}\n\nOverwrite it with your queued version?`,
            [
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => setPushing(false),
              },
              {
                text: 'Overwrite',
                style: 'destructive',
                onPress: () => doPush({ remotePath: conflictingPost.path }),
              },
            ]
          )
          return
        }
      }
    }

    await doPush(useRemoteIdentity ? {
      remotePath: item.remotePath,
      sourceSha: item.sourceSha,
      lastCommitId: item.sourceLastCommitId,
    } : {})
  }

  const site = getSiteTheme(item.siteId)
  const color = site.color
  const label = site.label
  const provider = PROVIDERS.find(p => p.id === destination) || PROVIDERS[0]
  const defaultBranch = getDefaultBranch(destination)
  const effectiveBranch = branchOverride.trim() || defaultBranch
  const imageUploadDir = settingsSnapshot ? getImageUploadDirectory(
    settingsSnapshot.sites?.find(s => s.id === item.siteId)?.path || ''
  ) : null

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.headerText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Push to {label}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Summary card */}
        <View style={styles.card}>
          <View style={[styles.siteBadge, { backgroundColor: color }]}>
            <Text style={styles.siteBadgeText}>{label}</Text>
          </View>
          <View style={[styles.providerBadge, { backgroundColor: provider.color }]}>
            <Text style={styles.providerBadgeText}>{provider.label}</Text>
          </View>
          <Text style={styles.filename}>{item.filename}</Text>
          <Text style={styles.siteTitle}>{site.title}</Text>
          <Text style={styles.siteSubtitle}>{site.subtitle}</Text>
          {item.remotePath ? (
            <View style={styles.remotePathWrap}>
              <Text style={styles.remotePathLabel}>Linked remote file</Text>
              <Text style={styles.remotePathValue}>{item.remotePath}</Text>
            </View>
          ) : null}
          {item.images?.length > 0 && (
            <Text style={styles.meta}>
              + {item.images.length} image{item.images.length !== 1 ? 's' : ''}
            </Text>
          )}
          {imageUploadDir && item.images?.length > 0 && (
            <Text style={styles.meta}>Images upload to {imageUploadDir}</Text>
          )}
          <Text style={styles.meta}>Added {new Date(item.addedAt).toLocaleDateString()}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Destination</Text>
          <Text style={styles.meta}>Choose where this queued post should be pushed.</Text>
          <View style={styles.destinationRow}>
            {PROVIDERS.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.destinationChip,
                  destination === p.id && { backgroundColor: p.color, borderColor: p.color },
                ]}
                onPress={() => setDestination(p.id)}
              >
                <Text
                  style={[
                    styles.destinationChipText,
                    destination === p.id && { color: '#fff' },
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.sectionLabel, styles.branchLabel]}>Branch</Text>
          <Text style={styles.meta}>
            Leave blank to use the {provider.label} default from Settings.
          </Text>
          <TextInput
            style={styles.branchInput}
            value={branchOverride}
            onChangeText={setBranchOverride}
            placeholder={`Use Settings default (${defaultBranch})`}
            placeholderTextColor="#9aa69a"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.branchHint}>This push will target: {effectiveBranch}</Text>
        </View>

        {/* Image thumbnails */}
        {item.images?.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Images to push</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {item.images.map(img => (
                <View key={img.uri} style={styles.thumbWrap}>
                  <Image source={{ uri: img.uri }} style={styles.thumb} />
                  <Text style={styles.thumbName} numberOfLines={1}>{img.filename}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Push log */}
        {log.length > 0 && (
          <View style={styles.logBox}>
            {log.map(entry => (
              <Text
                key={entry.id}
                style={[styles.logLine, !entry.ok && styles.logError]}
              >
                {entry.msg}
              </Text>
            ))}
          </View>
        )}

        {/* Push button */}
        <TouchableOpacity
          style={[styles.pushBtn, { backgroundColor: color }, pushing && styles.btnDisabled]}
          onPress={handlePush}
          disabled={pushing}
          activeOpacity={0.8}
        >
          {pushing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
          }
          <Text style={styles.pushBtnText}>
            {pushing ? 'Pushing…' : 'Push Now'}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: {
    backgroundColor: colors.header,
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: colors.headerText, fontSize: 18, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  siteBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  siteBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  providerBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  providerBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  filename: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 4 },
  siteTitle: { fontSize: 13, fontWeight: '700', color: colors.textStrong, marginBottom: 2 },
  siteSubtitle: { fontSize: 12, color: colors.textMuted, marginBottom: 8, lineHeight: 17 },
  remotePathWrap: {
    marginBottom: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  remotePathLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  remotePathValue: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 10, textTransform: 'uppercase' },
  destinationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  destinationChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  destinationChipText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  branchLabel: { marginTop: 16 },
  branchInput: {
    marginTop: 8,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.inputText,
    borderWidth: 1,
    borderColor: colors.border,
  },
  branchHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  thumbWrap: { marginRight: 10, alignItems: 'center', width: 80 },
  thumb: { width: 80, height: 80, borderRadius: 8 },
  thumbName: { fontSize: 10, color: colors.textMuted, marginTop: 4, width: 80, textAlign: 'center' },
  logBox: {
    backgroundColor: colors.codeBg,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  logLine: { color: colors.codeText, fontSize: 13, fontFamily: 'monospace', marginBottom: 4, lineHeight: 18 },
  logError: { color: colors.dangerSoft },
  pushBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 12,
    paddingVertical: 18,
  },
  pushBtnText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  btnDisabled: { opacity: 0.6 },
})
