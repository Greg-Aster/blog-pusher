import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { saveDraft, deleteDraft, loadSettings } from '../utils/storage'
import { publishToGitLab } from '../utils/gitlab'

const SITES = [
  { id: 'temporal', label: 'Temporal Flow', color: '#4a90d9' },
  { id: 'dndiy', label: 'DNDIY', color: '#9b59b6' },
  { id: 'travel', label: 'Trail Log', color: '#2d6a4f' },
  { id: 'megameal', label: 'MEGAMEAL', color: '#c0392b' },
]

export default function EditorScreen({ navigation, route }) {
  const incoming = route.params?.draft
  const [draft, setDraft] = useState(incoming || {})
  const [publishing, setPublishing] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef(null)

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    })
  }, [])

  // Auto-save to drafts 1.5s after any change
  function updateField(field, value) {
    const updated = {
      ...draft,
      [field]: value,
      updatedAt: new Date().toISOString(),
    }
    setDraft(updated)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (updated.title || updated.content) {
        setSaving(true)
        await saveDraft(updated)
        setSaving(false)
      }
    }, 1500)
  }

  async function handleSave() {
    if (!draft.title && !draft.content) {
      Alert.alert('Nothing to save', 'Add a title or some content first.')
      return
    }
    await saveDraft({ ...draft, updatedAt: new Date().toISOString() })
    navigation.goBack()
  }

  async function handlePublish() {
    if (!draft.title?.trim()) {
      Alert.alert('Title required', 'Please add a title before publishing.')
      return
    }

    const settings = await loadSettings()
    if (!settings.token) {
      Alert.alert(
        'No token',
        'Go to Settings and add your GitLab Personal Access Token first.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => navigation.navigate('Settings') },
        ]
      )
      return
    }

    const site = SITES.find(s => s.id === (draft.siteId || 'temporal'))
    const siteConfig = settings.sites?.find(s => s.id === site.id)

    Alert.alert(
      'Publish Post',
      `Publish "${draft.title}" to ${site?.label}?\n\nThis will create a new file in your GitLab repo and trigger a deploy.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            setPublishing(true)
            const result = await publishToGitLab(
              draft,
              settings,
              siteConfig?.path || ''
            )
            setPublishing(false)

            if (result.ok) {
              Alert.alert(
                'Published!',
                `Your post is live.\n\nFile: ${result.filePath}\n\nCloudflare will deploy it in ~2 minutes.`,
                [
                  {
                    text: 'Delete draft',
                    style: 'destructive',
                    onPress: async () => {
                      if (draft.id) await deleteDraft(draft.id)
                      navigation.goBack()
                    },
                  },
                  { text: 'Keep draft', onPress: () => navigation.goBack() },
                ]
              )
            } else {
              Alert.alert('Publish failed', result.error)
            }
          },
        },
      ]
    )
  }

  const activeSite = SITES.find(s => s.id === (draft.siteId || 'temporal'))

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {draft.id ? 'Edit Post' : 'New Post'}
        </Text>
        <Text style={styles.saveStatus}>
          {saving ? 'Saving…' : ''}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Site selector */}
        <Text style={styles.label}>Post to</Text>
        <View style={styles.siteRow}>
          {SITES.map(site => (
            <TouchableOpacity
              key={site.id}
              style={[
                styles.siteChip,
                draft.siteId === site.id && {
                  backgroundColor: site.color,
                  borderColor: site.color,
                },
              ]}
              onPress={() => updateField('siteId', site.id)}
            >
              <Text
                style={[
                  styles.siteChipText,
                  draft.siteId === site.id && { color: '#fff' },
                ]}
              >
                {site.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Title */}
        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.titleInput}
          value={draft.title || ''}
          onChangeText={v => updateField('title', v)}
          placeholder="Post title"
          placeholderTextColor="#aaa"
          returnKeyType="next"
          autoCapitalize="words"
        />

        {/* Description */}
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.input}
          value={draft.description || ''}
          onChangeText={v => updateField('description', v)}
          placeholder="Short summary (optional)"
          placeholderTextColor="#aaa"
          returnKeyType="next"
        />

        {/* Tags */}
        <Text style={styles.label}>Tags</Text>
        <TextInput
          style={styles.input}
          value={draft.tags || ''}
          onChangeText={v => updateField('tags', v)}
          placeholder="Hiking, Nature, Trail (comma separated)"
          placeholderTextColor="#aaa"
          returnKeyType="next"
          autoCapitalize="words"
        />

        {/* Category */}
        <Text style={styles.label}>Category</Text>
        <TextInput
          style={styles.input}
          value={draft.category || 'Blog'}
          onChangeText={v => updateField('category', v)}
          placeholder="Blog"
          placeholderTextColor="#aaa"
          returnKeyType="next"
          autoCapitalize="words"
        />

        {/* Content */}
        <Text style={styles.label}>Content *</Text>
        <TextInput
          style={styles.contentInput}
          value={draft.content || ''}
          onChangeText={v => updateField('content', v)}
          placeholder="Write your post here. Markdown is supported.&#10;&#10;## Heading&#10;&#10;Your story..."
          placeholderTextColor="#aaa"
          multiline
          textAlignVertical="top"
          autoCapitalize="sentences"
        />
      </ScrollView>

      {/* Bottom action bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          activeOpacity={0.7}
        >
          <Ionicons name="save-outline" size={18} color="#2d6a4f" />
          <Text style={styles.saveBtnText}>Save Draft</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.publishBtn,
            { backgroundColor: activeSite?.color || '#2d6a4f' },
            publishing && styles.btnDisabled,
          ]}
          onPress={handlePublish}
          disabled={publishing}
          activeOpacity={0.8}
        >
          {publishing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.publishBtnText}>Publish</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f0',
  },
  header: {
    backgroundColor: '#1a3a2a',
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  saveStatus: {
    color: '#aed8c0',
    fontSize: 12,
    width: 55,
    textAlign: 'right',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
  },
  siteRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  siteChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  siteChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#555',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1a2e1a',
    borderWidth: 1,
    borderColor: '#e0e8e0',
  },
  titleInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#1a2e1a',
    borderWidth: 1,
    borderColor: '#e0e8e0',
  },
  contentInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1a2e1a',
    minHeight: 300,
    borderWidth: 1,
    borderColor: '#e0e8e0',
    lineHeight: 22,
  },
  bottomBar: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e8eee8',
    gap: 10,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: '#2d6a4f',
    backgroundColor: '#fff',
  },
  saveBtnText: {
    color: '#2d6a4f',
    fontWeight: '600',
    fontSize: 15,
  },
  publishBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 14,
  },
  publishBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.6,
  },
})
