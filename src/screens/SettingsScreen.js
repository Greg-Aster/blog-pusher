import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Linking,
  Clipboard,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { loadSettings, saveSettings } from '../utils/storage'

export default function SettingsScreen({ navigation }) {
  const [settings, setSettings] = useState(null)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    navigation.setOptions({ headerShown: false })
    loadSettings().then(setSettings)
  }, [])

  function updateSitePath(id, value) {
    setSettings(prev => ({
      ...prev,
      sites: prev.sites.map(s => (s.id === id ? { ...s, path: value } : s)),
    }))
  }

  async function handleSave() {
    await saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleTestToken() {
    if (!settings.token) {
      Alert.alert('No token', 'Enter your token first.')
      return
    }
    try {
      const encoded = encodeURIComponent(settings.project)
      const res = await fetch(
        `https://gitlab.com/api/v4/projects/${encoded}`,
        { headers: { 'PRIVATE-TOKEN': settings.token } }
      )
      if (res.ok) {
        const data = await res.json()
        Alert.alert('Token works!', `Connected to project: ${data.name_with_namespace}`)
      } else if (res.status === 401) {
        Alert.alert('Invalid token', 'GitLab rejected this token. Check it and try again.')
      } else if (res.status === 404) {
        Alert.alert('Project not found', `Could not find project "${settings.project}". Check the project path.`)
      } else {
        Alert.alert('Error', `Status ${res.status}`)
      }
    } catch {
      Alert.alert('Network error', 'Could not reach GitLab. Are you online?')
    }
  }

  if (!settings) return null

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Token section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GitLab Access</Text>

          <Text style={styles.label}>Personal Access Token</Text>
          <View style={styles.tokenRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={settings.token}
              onChangeText={v => setSettings(prev => ({ ...prev, token: v }))}
              placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
              placeholderTextColor="#aaa"
              secureTextEntry={!tokenVisible}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setTokenVisible(v => !v)}
            >
              <Ionicons
                name={tokenVisible ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => {
                if (!settings.token) {
                  Alert.alert('No token', 'Nothing to copy yet.')
                  return
                }
                Clipboard.setString(settings.token)
                Alert.alert('Copied', 'Token copied to clipboard. Paste it somewhere safe like your Notes app.')
              }}
            >
              <Ionicons name="copy-outline" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() =>
              Linking.openURL(
                'https://gitlab.com/-/user_settings/personal_access_tokens'
              )
            }
          >
            <Ionicons name="open-outline" size={14} color="#4a90d9" />
            <Text style={styles.linkText}>
              Create a token on GitLab (needs api scope)
            </Text>
          </TouchableOpacity>

          <Text style={styles.label}>Project Path</Text>
          <TextInput
            style={styles.input}
            value={settings.project}
            onChangeText={v => setSettings(prev => ({ ...prev, project: v }))}
            placeholder="username/repo-name"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity style={styles.testBtn} onPress={handleTestToken}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#2d6a4f" />
            <Text style={styles.testBtnText}>Test Connection</Text>
          </TouchableOpacity>
        </View>

        {/* Site paths section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Site Content Paths</Text>
          <Text style={styles.hint}>
            The folder inside your repo where posts are stored for each site.
          </Text>

          {settings.sites.map(site => (
            <View key={site.id}>
              <Text style={styles.label}>{site.name}</Text>
              <TextInput
                style={styles.input}
                value={site.path}
                onChangeText={v => updateSitePath(site.id, v)}
                placeholder="path/to/content/posts"
                placeholderTextColor="#aaa"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ))}
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveBtn, saved && styles.saveBtnDone]}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Ionicons
            name={saved ? 'checkmark' : 'save-outline'}
            size={18}
            color="#fff"
          />
          <Text style={styles.saveBtnText}>
            {saved ? 'Saved!' : 'Save Settings'}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
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
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e8e0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a3a2a',
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
  },
  hint: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#f8faf8',
    borderRadius: 8,
    padding: 11,
    fontSize: 14,
    color: '#1a2e1a',
    borderWidth: 1,
    borderColor: '#dde8dd',
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyeBtn: {
    padding: 11,
    backgroundColor: '#f8faf8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dde8dd',
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    marginBottom: 4,
  },
  linkText: {
    fontSize: 13,
    color: '#4a90d9',
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#2d6a4f',
    alignSelf: 'flex-start',
  },
  testBtnText: {
    color: '#2d6a4f',
    fontWeight: '600',
    fontSize: 14,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2d6a4f',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 4,
  },
  saveBtnDone: {
    backgroundColor: '#4a9e6f',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
})
