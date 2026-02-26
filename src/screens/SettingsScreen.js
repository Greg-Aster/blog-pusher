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
  const [tokenVisible, setTokenVisible] = useState({
    gitlab: false,
    github: false,
  })
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

  function updateProvider(provider, field, value) {
    setSettings(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: {
          ...(prev.providers?.[provider] || {}),
          [field]: value,
        },
      },
    }))
  }

  function toggleToken(provider) {
    setTokenVisible(prev => ({
      ...prev,
      [provider]: !prev[provider],
    }))
  }

  function copyToken(provider) {
    const token = settings?.providers?.[provider]?.token || ''
    if (!token) {
      Alert.alert('No token', 'Nothing to copy yet.')
      return
    }
    Clipboard.setString(token)
    Alert.alert('Copied', `${provider === 'github' ? 'GitHub' : 'GitLab'} token copied to clipboard.`)
  }

  async function handleSave() {
    await saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleTestConnection(provider) {
    if (provider === 'github') {
      const github = settings.providers?.github || {}
      if (!github.token) {
        Alert.alert('No GitHub token', 'Enter your GitHub token first.')
        return
      }
      if (!github.owner || !github.repo) {
        Alert.alert('Missing repo', 'Enter GitHub owner and repo first.')
        return
      }

      try {
        const owner = encodeURIComponent(github.owner.trim())
        const repo = encodeURIComponent(github.repo.trim())
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          headers: {
            Authorization: `Bearer ${github.token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        })
        if (res.ok) {
          const data = await res.json()
          Alert.alert('GitHub works!', `Connected to repo: ${data.full_name}`)
        } else if (res.status === 401 || res.status === 403) {
          Alert.alert('Invalid token', 'GitHub rejected this token or scope is insufficient.')
        } else if (res.status === 404) {
          Alert.alert('Repo not found', 'Could not find that GitHub repo, or token has no access.')
        } else {
          Alert.alert('Error', `GitHub status ${res.status}`)
        }
      } catch {
        Alert.alert('Network error', 'Could not reach GitHub. Are you online?')
      }
      return
    }

    const gitlab = settings.providers?.gitlab || {}
    if (!gitlab.token) {
      Alert.alert('No GitLab token', 'Enter your GitLab token first.')
      return
    }
    if (!gitlab.project) {
      Alert.alert('No project path', 'Enter your GitLab project path first.')
      return
    }

    try {
      const encoded = encodeURIComponent(gitlab.project)
      const res = await fetch(`https://gitlab.com/api/v4/projects/${encoded}`, {
        headers: { 'PRIVATE-TOKEN': gitlab.token },
      })
      if (res.ok) {
        const data = await res.json()
        Alert.alert('GitLab works!', `Connected to project: ${data.name_with_namespace}`)
      } else if (res.status === 401) {
        Alert.alert('Invalid token', 'GitLab rejected this token. Check it and try again.')
      } else if (res.status === 404) {
        Alert.alert('Project not found', `Could not find project "${gitlab.project}".`)
      } else {
        Alert.alert('Error', `GitLab status ${res.status}`)
      }
    } catch {
      Alert.alert('Network error', 'Could not reach GitLab. Are you online?')
    }
  }

  if (!settings) return null

  const gitlab = settings.providers?.gitlab || {}
  const github = settings.providers?.github || {}

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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GitLab Access</Text>

          <Text style={styles.label}>Personal Access Token</Text>
          <View style={styles.tokenRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={gitlab.token}
              onChangeText={v => updateProvider('gitlab', 'token', v)}
              placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
              placeholderTextColor="#aaa"
              secureTextEntry={!tokenVisible.gitlab}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => toggleToken('gitlab')}>
              <Ionicons
                name={tokenVisible.gitlab ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.eyeBtn} onPress={() => copyToken('gitlab')}>
              <Ionicons name="copy-outline" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() =>
              Linking.openURL('https://gitlab.com/-/user_settings/personal_access_tokens')
            }
          >
            <Ionicons name="open-outline" size={14} color="#4a90d9" />
            <Text style={styles.linkText}>Create a GitLab token (needs `api` scope)</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Project Path</Text>
          <TextInput
            style={styles.input}
            value={gitlab.project}
            onChangeText={v => updateProvider('gitlab', 'project', v)}
            placeholder="username/repo-name"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Branch</Text>
          <TextInput
            style={styles.input}
            value={gitlab.branch}
            onChangeText={v => updateProvider('gitlab', 'branch', v)}
            placeholder="main"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity style={styles.testBtn} onPress={() => handleTestConnection('gitlab')}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#2d6a4f" />
            <Text style={styles.testBtnText}>Test GitLab Connection</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GitHub Access</Text>

          <Text style={styles.label}>Personal Access Token</Text>
          <View style={styles.tokenRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={github.token}
              onChangeText={v => updateProvider('github', 'token', v)}
              placeholder="github_pat_xxxxxxxxxxxxxxxxxxxx"
              placeholderTextColor="#aaa"
              secureTextEntry={!tokenVisible.github}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => toggleToken('github')}>
              <Ionicons
                name={tokenVisible.github ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.eyeBtn} onPress={() => copyToken('github')}>
              <Ionicons name="copy-outline" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() =>
              Linking.openURL('https://github.com/settings/personal-access-tokens/new')
            }
          >
            <Ionicons name="open-outline" size={14} color="#4a90d9" />
            <Text style={styles.linkText}>Create a GitHub token (needs `repo` access)</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Owner</Text>
          <TextInput
            style={styles.input}
            value={github.owner}
            onChangeText={v => updateProvider('github', 'owner', v)}
            placeholder="Greg.Aster"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Repository</Text>
          <TextInput
            style={styles.input}
            value={github.repo}
            onChangeText={v => updateProvider('github', 'repo', v)}
            placeholder="merkin"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Branch</Text>
          <TextInput
            style={styles.input}
            value={github.branch}
            onChangeText={v => updateProvider('github', 'branch', v)}
            placeholder="main"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity style={styles.testBtn} onPress={() => handleTestConnection('github')}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#2d6a4f" />
            <Text style={styles.testBtnText}>Test GitHub Connection</Text>
          </TouchableOpacity>
        </View>

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
