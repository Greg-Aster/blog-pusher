import React, { useState } from 'react'
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
import { Ionicons } from '@expo/vector-icons'
import { addToQueue } from '../utils/storage'

const SITES = [
  { id: 'temporal', label: 'Temporal Flow', color: '#4a90d9' },
  { id: 'dndiy', label: 'DNDIY', color: '#9b59b6' },
  { id: 'travel', label: 'Trail Log', color: '#2d6a4f' },
  { id: 'megameal', label: 'MEGAMEAL', color: '#c0392b' },
]

export default function AddPostScreen({ navigation }) {
  const [mdFile, setMdFile] = useState(null)
  const [images, setImages] = useState([])
  const [siteId, setSiteId] = useState('temporal')

  async function pickMarkdownFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/markdown', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const asset = result.assets[0]
      // Accept .md and .txt files
      if (!asset.name.endsWith('.md') && !asset.name.endsWith('.txt') && !asset.name.endsWith('.mdx')) {
        Alert.alert('Wrong file type', 'Please pick a .md or .txt file.')
        return
      }
      setMdFile(asset)
    } catch (err) {
      Alert.alert('Error', err.message)
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

    // Read content immediately while we have URI access.
    // Use fetch() because it handles both file:// and content:// URIs on Android.
    let content
    try {
      const response = await fetch(mdFile.uri)
      content = await response.text()
      if (!content && content !== '') throw new Error('empty')
    } catch {
      Alert.alert('Cannot read file', 'Could not read the file. Try saving it from Markor first, then pick it again.')
      return
    }

    await addToQueue({
      id: Date.now().toString(),
      filename: mdFile.name,
      content,
      siteId,
      images: images.map(img => ({
        uri: img.uri,
        filename: img.fileName || img.uri.split('/').pop(),
      })),
      addedAt: new Date().toISOString(),
    })

    Alert.alert(
      'Added to queue',
      `"${mdFile.name}" is ready to push to ${SITES.find(s => s.id === siteId)?.label}.`,
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    )
  }

  const activeSite = SITES.find(s => s.id === siteId)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Post to Queue</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Step 1: Pick markdown file */}
        <View style={styles.section}>
          <Text style={styles.stepLabel}>Step 1 — Markdown File</Text>
          <Text style={styles.hint}>
            Write your post in Markor or any editor, save as .md, then pick it here.
          </Text>
          <TouchableOpacity style={styles.pickBtn} onPress={pickMarkdownFile} activeOpacity={0.7}>
            <Ionicons name="document-text-outline" size={20} color="#2d6a4f" />
            <Text style={styles.pickBtnText}>
              {mdFile ? mdFile.name : 'Pick .md file from phone'}
            </Text>
            {mdFile && <Ionicons name="checkmark-circle" size={20} color="#2d6a4f" />}
          </TouchableOpacity>
          {mdFile && (
            <TouchableOpacity onPress={() => setMdFile(null)} style={styles.clearBtn}>
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
            <Ionicons name="image-outline" size={20} color="#4a90d9" />
            <Text style={[styles.pickBtnText, { color: '#4a90d9' }]}>
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
  section: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e0e8e0',
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a3a2a',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hint: { fontSize: 13, color: '#888', marginBottom: 12, lineHeight: 18 },
  code: { fontFamily: 'monospace', color: '#555', backgroundColor: '#f0f0f0' },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#2d6a4f',
    borderRadius: 10,
    padding: 12,
    borderStyle: 'dashed',
  },
  pickBtnText: { flex: 1, color: '#2d6a4f', fontWeight: '600', fontSize: 14 },
  clearBtn: { marginTop: 8, alignSelf: 'flex-start' },
  clearBtnText: { color: '#e74c3c', fontSize: 13 },
  imageRow: { marginTop: 12 },
  thumbWrap: { marginRight: 10, alignItems: 'center', width: 80 },
  thumb: { width: 80, height: 80, borderRadius: 8 },
  removeImg: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#e74c3c',
    borderRadius: 9,
  },
  thumbName: { fontSize: 10, color: '#888', marginTop: 4, width: 80, textAlign: 'center' },
  siteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  siteChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  siteChipText: { fontSize: 13, fontWeight: '500', color: '#555' },
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
