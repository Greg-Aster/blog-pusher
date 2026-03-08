import React, { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  StatusBar,
  ScrollView,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { deleteDraft, getDraftIdentity, loadDrafts, loadQueue, removeFromQueue } from '../utils/storage'
import { alpha, useAppTheme } from '../utils/theme'
import { getSiteTheme } from '../utils/siteThemes'

const PROVIDER_LABELS = {
  gitlab: 'GitLab',
  github: 'GitHub',
}

export default function HomeScreen({ navigation }) {
  const theme = useAppTheme()
  const colors = theme.colors
  const styles = useMemo(() => createStyles(colors), [colors])
  const [queue, setQueue] = useState([])
  const [drafts, setDrafts] = useState([])

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadQueue(), loadDrafts()]).then(([nextQueue, nextDrafts]) => {
        setQueue(nextQueue)
        setDrafts(nextDrafts)
      })
    }, [])
  )

  function handleRemove(id, name) {
    Alert.alert(
      'Remove from queue',
      `Remove "${name}" from the push queue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeFromQueue(id)
            setQueue(prev => prev.filter(i => i.id !== id))
          },
        },
      ]
    )
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  const queuedDraftIds = new Set(queue.map(item => item.id))
  const visibleDrafts = drafts.filter(draft => !queuedDraftIds.has(draft.id))

  function handleRemoveDraft(id, name) {
    Alert.alert(
      'Delete local draft',
      `Delete the autosaved draft for "${name}" from this device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDraft(id)
            setDrafts(prev => prev.filter(draft => draft.id !== id))
          },
        },
      ]
    )
  }

  function renderItem({ item }) {
    const site = getSiteTheme(item.siteId)
    const color = site.color
    const label = site.label
    const imageCount = item.images?.length || 0
    const providerLabel = PROVIDER_LABELS[item.remoteProvider || item.destination] || 'Choose on push'
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('PostEditor', { queueItem: item })}
        onLongPress={() => navigation.navigate('Push', { item })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.siteBadge, { backgroundColor: color }]}>
            <Text style={styles.siteBadgeText}>{label}</Text>
          </View>
          <View style={styles.cardActions}>
            {imageCount > 0 && (
              <View style={styles.imageBadge}>
                <Ionicons name="image-outline" size={13} color="#666" />
                <Text style={styles.imageBadgeText}>{imageCount}</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => navigation.navigate('Push', { item })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.pushIconBtn}
            >
              <Ionicons name="cloud-upload-outline" size={18} color={color} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleRemove(item.id, item.filename)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="trash-outline" size={18} color="#bbb" />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.filename}
        </Text>
        <Text style={styles.cardSiteTitle} numberOfLines={1}>
          {site.title}
        </Text>
        <Text style={styles.cardSiteSubtitle} numberOfLines={1}>
          {site.subtitle}
        </Text>
        <Text style={styles.cardDate}>Added {formatDate(item.addedAt)}</Text>
        <Text style={styles.cardMeta}>{providerLabel}</Text>
        <View style={styles.pushRow}>
          <Ionicons name="create-outline" size={14} color={color} />
          <Text style={[styles.pushText, { color }]}>Tap to edit</Text>
          <Text style={styles.pushHint}> | Long-press to push</Text>
        </View>
      </TouchableOpacity>
    )
  }

  const actionCards = [
    {
      id: 'create',
      title: 'Create New Post',
      body: 'Start a blank Markdown draft on your phone and queue it for push.',
      icon: 'create-outline',
      color: colors.accent,
      onPress: () => navigation.navigate('PostEditor', {
        raw: '',
        filename: 'new-post.md',
        siteId: 'temporal',
      }),
    },
    {
      id: 'import',
      title: 'Import Markdown File',
      body: 'Bring a local file into the editor, attach photos, and save it to the queue.',
      icon: 'document-attach-outline',
      color: '#8b5e34',
      onPress: () => navigation.navigate('AddPost'),
    },
    {
      id: 'browse',
      title: 'Browse Repository',
      body: 'Open an existing remote post from GitHub or GitLab and edit it in place.',
      icon: 'folder-open-outline',
      color: colors.link,
      onPress: () => navigation.navigate('RepoBrowser'),
    },
  ]

  function renderHeader() {
    return (
      <View>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Mobile Publishing</Text>
          <Text style={styles.heroTitle}>Create, edit, browse, and push blog posts from your phone.</Text>
          <Text style={styles.heroBody}>
            Local drafts and remote repository posts now share the same editor and push queue.
          </Text>
        </View>

        <View style={styles.actionGrid}>
          {actionCards.map(action => (
            <TouchableOpacity
              key={action.id}
              style={[styles.actionCard, { borderTopColor: action.color }]}
              onPress={action.onPress}
              activeOpacity={0.82}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: alpha(action.color, '20') }]}>
                <Ionicons name={action.icon} size={22} color={action.color} />
              </View>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={styles.actionBody}>{action.body}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {visibleDrafts.length > 0 ? (
          <View style={styles.draftsSection}>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.queueLabel}>Resume Drafts</Text>
              <Text style={styles.sectionHint}>
                {visibleDrafts.length} local draft{visibleDrafts.length !== 1 ? 's' : ''}
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.draftsRow}
            >
              {visibleDrafts.map(draft => {
                const site = getSiteTheme(draft.repoSiteId)
                const color = site.color
                const label = site.label || draft.repoSiteId || 'Draft'
                const title = draft.title || draft.filename || 'Untitled draft'
                const draftType = getDraftIdentity(draft)
                  ? 'Repo draft saved on device'
                  : 'Local draft saved on device'

                return (
                  <TouchableOpacity
                    key={draft.id}
                    style={styles.draftCard}
                    activeOpacity={0.82}
                    onPress={() => navigation.navigate('PostEditor', { draft })}
                    onLongPress={() => handleRemoveDraft(draft.id, title)}
                  >
                    <View style={styles.draftCardHeader}>
                      <View style={[styles.siteBadge, { backgroundColor: color }]}>
                        <Text style={styles.siteBadgeText}>{label}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleRemoveDraft(draft.id, title)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="trash-outline" size={18} color="#bbb" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.draftTitle} numberOfLines={2}>
                      {title}
                    </Text>
                    <Text style={styles.draftFilename} numberOfLines={1}>
                      {draft.filename || 'new-post.md'}
                    </Text>
                    <Text style={styles.draftSiteTitle} numberOfLines={1}>
                      {site.title}
                    </Text>
                    <Text style={styles.draftMeta}>{draftType}</Text>
                    <Text style={styles.draftMeta}>
                      Updated {formatDate(draft.updatedAt || draft.createdAt || new Date().toISOString())}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        ) : null}

        <Text style={styles.queueLabel}>
          Push Queue
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={colors.header}
      />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Blog Pusher</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            onPress={() => navigation.navigate('FormatReference')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="book-outline" size={24} color={colors.headerText} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={24} color={colors.headerText} />
          </TouchableOpacity>
        </View>
      </View>

      {queue.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={() => null}
          keyExtractor={item => item.id}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cloud-upload-outline" size={64} color={colors.textSoft} />
              <Text style={styles.emptyTitle}>Queue is empty</Text>
              <Text style={styles.emptyText}>
                Create a post, import one, or browse your repo to start editing.
              </Text>
            </View>
          }
          contentContainerStyle={styles.emptyList}
        />
      ) : (
        <FlatList
          data={queue}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.list}
          ListFooterComponent={
            <Text style={styles.queueFooter}>
              {queue.length} post{queue.length !== 1 ? 's' : ''} ready to edit or push
            </Text>
          }
        />
      )}
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
  headerTitle: { color: colors.headerText, fontSize: 22, fontWeight: '700', letterSpacing: 0.5 },
  headerIcons: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  hero: {
    backgroundColor: colors.hero,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  heroEyebrow: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  heroTitle: { color: colors.textStrong, fontSize: 24, fontWeight: '700', lineHeight: 30 },
  heroBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  actionGrid: { padding: 16, gap: 12 },
  draftsSection: { paddingTop: 4, paddingBottom: 10 },
  sectionHeadingRow: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionHint: { fontSize: 12, color: colors.textMuted },
  draftsRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
  },
  draftCard: {
    width: 236,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  draftCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  draftTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  draftFilename: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  draftSiteTitle: {
    color: colors.textStrong,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  draftMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderTopWidth: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 6 },
  actionBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  queueLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  list: { paddingBottom: 40 },
  emptyList: { flexGrow: 1, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  siteBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  siteBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  imageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.overlay,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  imageBadgeText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 4 },
  cardSiteTitle: { fontSize: 12, fontWeight: '700', color: colors.textStrong, marginBottom: 2 },
  cardSiteSubtitle: { fontSize: 11, color: colors.textMuted, marginBottom: 6 },
  cardDate: { fontSize: 11, color: colors.textSoft, marginBottom: 6 },
  cardMeta: {
    alignSelf: 'flex-start',
    color: colors.badgeText,
    backgroundColor: colors.badgeBg,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  pushRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pushText: { fontSize: 12, fontWeight: '600' },
  pushHint: { fontSize: 12, color: colors.textSoft },
  pushIconBtn: { marginRight: 2 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  queueFooter: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    paddingTop: 8,
    paddingBottom: 12,
  },
})
