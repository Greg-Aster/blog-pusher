import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { Ionicons } from '@expo/vector-icons'
import { addToQueue } from '../utils/storage'
import { useAppTheme } from '../utils/theme'

const SITES = [
  { id: 'temporal', label: 'Temporal Flow', color: '#4a90d9' },
  { id: 'dndiy', label: 'DNDIY', color: '#9b59b6' },
  { id: 'travel', label: 'Trail Log', color: '#2d6a4f' },
  { id: 'megameal', label: 'MEGAMEAL', color: '#c0392b' },
]

function looksLikeMarkdown(name = '') {
  const lowerName = String(name).toLowerCase()
  return (
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.mdx') ||
    lowerName.endsWith('.txt')
  )
}

function normalizeSharedFilename(sharedFile) {
  const provided = String(sharedFile?.name || '').trim()
  if (looksLikeMarkdown(provided)) return provided
  if (provided) return `${provided}.md`
  return 'shared-note.md'
}

export default function AddPostScreen({ navigation, route }) {
  const theme = useAppTheme()
  const colors = theme.colors
  const styles = useMemo(() => createStyles(colors), [colors])
  const [mdFile, setMdFile] = useState(null)
  const [images, setImages] = useState([])
  const [siteId, setSiteId] = useState('temporal')
  const [sharedText, setSharedText] = useState('')

  useEffect(() => {
    const sharedFile = route.params?.sharedFile
    if (!sharedFile) return

    const normalizedName = normalizeSharedFilename(sharedFile)
    if (sharedFile.uri) {
      setMdFile({
        name: normalizedName,
        uri: sharedFile.uri,
        mimeType: sharedFile.mimeType || 'text/markdown',
      })
      setSharedText('')
      return
    }

    if (sharedFile.text) {
      setMdFile({
        name: normalizedName,
        uri: '',
        mimeType: sharedFile.mimeType || 'text/plain',
      })
      setSharedText(sharedFile.text)
    }
  }, [route.params?.sharedAt, route.params?.sharedFile])

  async function pickMarkdownFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/markdown', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const asset = result.assets[0]
      if (!looksLikeMarkdown(asset.name)) {
        Alert.alert('Wrong file type', 'Please pick a .md or .txt file.')
        return
      }
      setMdFile(asset)
      setSharedText('')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      Alert.alert('Error', message)
    }
  }

  async function pickImages() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photos to attach images.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    })
    if (result.canceled) return
    setImages(prev => {
      const existing = new Set(prev.map(i => i.uri))
      const newOnes = result.assets.filter(a => !existing.has(a.uri))
      return [...prev, ...newOnes]
    })
  }

  function removeImage(uri) {
    setImages(prev => prev.filter(i => i.uri !== uri))
  }

  async function handleAddToQueue() {
    if (!mdFile) {
      Alert.alert('No file selected', 'Pick a markdown file first.')
      return
    }

    let content
    const isSharedText = !mdFile.uri && !!sharedText
    const tempUri = FileSystem.cacheDirectory + 'upload_' + Date.now() + '.md'
    try {
      if (isSharedText) {
        content = sharedText
      } else {
        const sourceUri = mdFile.uri

        // Android returns a content:// URI from the file picker or share sheet.
        // Copy into app cache first so Expo can read it reliably.
        if (sourceUri?.startsWith('file://')) {
          content = await FileSystem.readAsStringAsync(sourceUri)
        } else {
          await FileSystem.copyAsync({ from: sourceUri, to: tempUri })
          content = await FileSystem.readAsStringAsync(tempUri)
        }
      }
    } catch (err) {
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      console.error('Failed to read markdown file', {
        err,
        mdFile,
        tempUri,
      })
      Alert.alert(
        'Cannot read file',
        `Could not read "${mdFile.name}".\n\n${detail}`
      )
      return
    } finally {
      FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {})
    }

    const imageList = images.map(img => ({
      uri: img.uri,
      filename: img.fileName || img.uri.split('/').pop(),
    }))

    // Open in the editor by default so the user can review/edit before queuing
    navigation.navigate('PostEditor', {
      raw: content,
      filename: mdFile.name,
      siteId,
      images: imageList,
    })
  }

  const activeSite = SITES.find(s => s.id === siteId)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.headerText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Post to Queue</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Step 1: Pick markdown file */}
        <View style={styles.section}>
          <Text style={styles.stepLabel}>Step 1 — Markdown File</Text>
          <Text style={styles.hint}>
            Pick a file from your phone, or share a markdown note directly into Blog Pusher.
          </Text>
          <TouchableOpacity style={styles.pickBtn} onPress={pickMarkdownFile} activeOpacity={0.7}>
            <Ionicons name="document-text-outline" size={20} color={colors.accent} />
            <Text style={styles.pickBtnText}>
              {mdFile ? mdFile.name : 'Pick .md file from phone'}
            </Text>
            {mdFile && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
          </TouchableOpacity>
          {mdFile && (
            <TouchableOpacity
              onPress={() => {
                setMdFile(null)
                setSharedText('')
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Step 2: Attach images */}
        <View style={styles.section}>
          <Text style={styles.stepLabel}>Step 2 — Images (optional)</Text>
          <Text style={styles.hint}>
            Images will be pushed to the site's public folder. Reference them in your markdown as{' '}
            <Text style={styles.code}>/blog-images/filename.jpg</Text>
          </Text>
          <TouchableOpacity style={styles.pickBtn} onPress={pickImages} activeOpacity={0.7}>
            <Ionicons name="image-outline" size={20} color={colors.link} />
            <Text style={[styles.pickBtnText, { color: colors.link }]}>
              {images.length > 0 ? `${images.length} image${images.length !== 1 ? 's' : ''} selected` : 'Pick photos from gallery'}
            </Text>
          </TouchableOpacity>
          {images.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
              {images.map(img => (
                <View key={img.uri} style={styles.thumbWrap}>
                  <Image source={{ uri: img.uri }} style={styles.thumb} />
                  <TouchableOpacity
                    style={styles.removeImg}
                    onPress={() => removeImage(img.uri)}
                  >
                    <Ionicons name="close-circle" size={18} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.thumbName} numberOfLines={1}>
                    {img.fileName || img.uri.split('/').pop()}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Step 3: Choose site */}
        <View style={styles.section}>
          <Text style={styles.stepLabel}>Step 3 — Target Site</Text>
          <View style={styles.siteRow}>
            {SITES.map(site => (
              <TouchableOpacity
                key={site.id}
                style={[
                  styles.siteChip,
                  siteId === site.id && { backgroundColor: site.color, borderColor: site.color },
                ]}
                onPress={() => setSiteId(site.id)}
              >
                <Text style={[styles.siteChipText, siteId === site.id && { color: '#fff' }]}>
                  {site.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Add to queue */}
        <TouchableOpacity
          style={[styles.queueBtn, { backgroundColor: activeSite?.color || '#2d6a4f' }]}
          onPress={handleAddToQueue}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={styles.queueBtnText}>Add to Push Queue</Text>
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
  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: 12, lineHeight: 18 },
  code: { fontFamily: 'monospace', color: colors.textMuted, backgroundColor: colors.overlay },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: 10,
    padding: 12,
    borderStyle: 'dashed',
  },
  pickBtnText: { flex: 1, color: colors.accent, fontWeight: '600', fontSize: 14 },
  clearBtn: { marginTop: 8, alignSelf: 'flex-start' },
  clearBtnText: { color: colors.danger, fontSize: 13 },
  imageRow: { marginTop: 12 },
  thumbWrap: { marginRight: 10, alignItems: 'center', width: 80 },
  thumb: { width: 80, height: 80, borderRadius: 8 },
  removeImg: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.danger,
    borderRadius: 9,
  },
  thumbName: { fontSize: 10, color: colors.textMuted, marginTop: 4, width: 80, textAlign: 'center' },
  siteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  siteChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  siteChipText: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  queueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 4,
  },
  queueBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
