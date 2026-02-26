import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native'
import * as FileSystem from 'expo-file-system'
import { Ionicons } from '@expo/vector-icons'
import { loadSettings, removeFromQueue } from '../utils/storage'
import { publishFileToGitLab, publishImageToGitLab } from '../utils/gitlab'

const SITE_LABELS = {
  temporal: 'Temporal Flow',
  dndiy: 'DNDIY',
  travel: 'Trail Log',
  megameal: 'MEGAMEAL',
}

const SITE_COLORS = {
  temporal: '#4a90d9',
  dndiy: '#9b59b6',
  travel: '#2d6a4f',
  megameal: '#c0392b',
}

export default function PushScreen({ navigation, route }) {
  const { item } = route.params
  const [pushing, setPushing] = useState(false)
  const [log, setLog] = useState([])

  function addLog(msg, ok = true) {
    setLog(prev => [...prev, { msg, ok, id: Date.now() + Math.random() }])
  }

  async function handlePush() {
    setPushing(true)
    setLog([])

    const settings = await loadSettings()
    if (!settings.token) {
      Alert.alert('No token', 'Add your GitLab token in Settings first.')
      setPushing(false)
      return
    }

    const siteConfig = settings.sites?.find(s => s.id === item.siteId)
    if (!siteConfig) {
      Alert.alert('Site not found', 'Check your site paths in Settings.')
      setPushing(false)
      return
    }

    let allOk = true

    // Push images first
    for (const img of item.images || []) {
      addLog(`Uploading image: ${img.filename}…`)
      const result = await publishImageToGitLab(img, settings, siteConfig)
      if (result.ok) {
        addLog(`✓ ${img.filename} → /blog-images/${img.filename}`)
      } else {
        addLog(`✗ ${img.filename}: ${result.error}`, false)
        allOk = false
      }
    }

    // Push the markdown file
    addLog(`Pushing ${item.filename}…`)
    let content
    try {
      content = await FileSystem.readAsStringAsync(item.fileUri)
    } catch {
      addLog('✗ Could not read the file. Was it moved or deleted?', false)
      setPushing(false)
      return
    }

    const result = await publishFileToGitLab(item.filename, content, settings, siteConfig.path)
    if (result.ok) {
      addLog(`✓ Post pushed → ${result.filePath}`)
      addLog('Deploy triggered. Site will update in ~2 minutes.')
    } else {
      addLog(`✗ ${result.error}`, false)
      allOk = false
    }

    setPushing(false)

    if (allOk) {
      Alert.alert(
        'Push complete!',
        'Everything uploaded. Remove from queue?',
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

  const color = SITE_COLORS[item.siteId] || '#2d6a4f'
  const label = SITE_LABELS[item.siteId] || item.siteId

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
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
          <Text style={styles.filename}>{item.filename}</Text>
          {item.images?.length > 0 && (
            <Text style={styles.meta}>
              + {item.images.length} image{item.images.length !== 1 ? 's' : ''}
            </Text>
          )}
          <Text style={styles.meta}>Added {new Date(item.addedAt).toLocaleDateString()}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  header: {
    backgroundColor: '#1a3a2a',
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e0e8e0',
  },
  siteBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  siteBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  filename: { fontSize: 17, fontWeight: '700', color: '#1a2e1a', marginBottom: 4 },
  meta: { fontSize: 13, color: '#888', marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 10, textTransform: 'uppercase' },
  thumbWrap: { marginRight: 10, alignItems: 'center', width: 80 },
  thumb: { width: 80, height: 80, borderRadius: 8 },
  thumbName: { fontSize: 10, color: '#888', marginTop: 4, width: 80, textAlign: 'center' },
  logBox: {
    backgroundColor: '#1a2e1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  logLine: { color: '#aed8c0', fontSize: 13, fontFamily: 'monospace', marginBottom: 4, lineHeight: 18 },
  logError: { color: '#ff8080' },
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
