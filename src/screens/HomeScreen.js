import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  StatusBar,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { loadQueue, removeFromQueue } from '../utils/storage'

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

const PROVIDER_LABELS = {
  gitlab: 'GitLab',
  github: 'GitHub',
}

export default function HomeScreen({ navigation }) {
  const [queue, setQueue] = useState([])

  useFocusEffect(
    useCallback(() => {
      loadQueue().then(setQueue)
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

  function renderItem({ item }) {
    const color = SITE_COLORS[item.siteId] || '#888'
    const label = SITE_LABELS[item.siteId] || item.siteId
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
      color: '#2d6a4f',
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
      color: '#4a90d9',
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
              <View style={[styles.actionIconWrap, { backgroundColor: `${action.color}18` }]}>
                <Ionicons name={action.icon} size={22} color={action.color} />
              </View>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={styles.actionBody}>{action.body}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.queueLabel}>
          Push Queue
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a3a2a" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Blog Pusher</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            onPress={() => navigation.navigate('FormatReference')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="book-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={24} color="#fff" />
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
              <Ionicons name="cloud-upload-outline" size={64} color="#ccc" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f2ec' },
  header: {
    backgroundColor: '#1a3a2a',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 0.5 },
  headerIcons: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  hero: {
    backgroundColor: '#efe7d8',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1d7c5',
  },
  heroEyebrow: {
    color: '#8b5e34',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  heroTitle: { color: '#2b2318', fontSize: 24, fontWeight: '700', lineHeight: 30 },
  heroBody: { color: '#635a4f', fontSize: 14, lineHeight: 21, marginTop: 8 },
  actionGrid: { padding: 16, gap: 12 },
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderTopWidth: 4,
    borderWidth: 1,
    borderColor: '#e0e6df',
  },
  actionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionTitle: { color: '#1a2e1a', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  actionBody: { color: '#748179', fontSize: 13, lineHeight: 19 },
  queueLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6f7b74',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  list: { paddingBottom: 40 },
  emptyList: { flexGrow: 1, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff',
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
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  imageBadgeText: { fontSize: 11, color: '#666', fontWeight: '600' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1a2e1a', marginBottom: 4 },
  cardDate: { fontSize: 11, color: '#aaa', marginBottom: 6 },
  cardMeta: {
    alignSelf: 'flex-start',
    color: '#6f7b74',
    backgroundColor: '#eef2ee',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  pushRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pushText: { fontSize: 12, fontWeight: '600' },
  pushHint: { fontSize: 12, color: '#bbb' },
  pushIconBtn: { marginRight: 2 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#444', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
  queueFooter: {
    color: '#7b877f',
    fontSize: 12,
    textAlign: 'center',
    paddingTop: 8,
    paddingBottom: 12,
  },
})
