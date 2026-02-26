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
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('Push', { item })}
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
        <View style={styles.pushRow}>
          <Ionicons name="cloud-upload-outline" size={14} color={color} />
          <Text style={[styles.pushText, { color }]}>Tap to push</Text>
        </View>
      </TouchableOpacity>
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

      {/* Primary action */}
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => navigation.navigate('AddPost')}
        activeOpacity={0.8}
      >
        <Ionicons name="add-circle-outline" size={22} color="#fff" />
        <Text style={styles.addBtnText}>Add Post to Queue</Text>
      </TouchableOpacity>

      {queue.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-upload-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>Queue is empty</Text>
          <Text style={styles.emptyText}>
            Add a post above. When you have signal, come back here and tap it to push.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.queueLabel}>
            {queue.length} post{queue.length !== 1 ? 's' : ''} ready to push
          </Text>
          <FlatList
            data={queue}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#2d6a4f',
    margin: 16,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  queueLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  list: { padding: 16, paddingTop: 8, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
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
  pushRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pushText: { fontSize: 12, fontWeight: '600' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#444', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
})
