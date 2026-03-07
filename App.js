import React, { useCallback, useEffect } from 'react'
import { AppState } from 'react-native'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import * as FileSystem from 'expo-file-system/legacy'
import HomeScreen from './src/screens/HomeScreen'
import AddPostScreen from './src/screens/AddPostScreen'
import PostEditorScreen from './src/screens/PostEditorScreen'
import PushScreen from './src/screens/PushScreen'
import RepoBrowserScreen from './src/screens/RepoBrowserScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import FormatReferenceScreen from './src/screens/FormatReferenceScreen'
import { consumeSharedFile } from './src/utils/shareIntent'

const Stack = createNativeStackNavigator()
const navigationRef = createNavigationContainerRef()

function normalizeSharedFilename(sharedFile) {
  const name = String(sharedFile?.name || '').trim()
  if (/\.(md|mdx|txt)$/i.test(name)) return name
  if (name) return `${name}.md`
  return 'shared-note.md'
}

export default function App() {
  const openSharedFile = useCallback(async () => {
    if (!navigationRef.isReady()) return

    const sharedFile = await consumeSharedFile()
    if (!sharedFile) return

    const filename = normalizeSharedFilename(sharedFile)
    let raw = ''

    try {
      if (sharedFile.text) {
        raw = sharedFile.text
      } else if (sharedFile.uri) {
        if (sharedFile.uri.startsWith('file://')) {
          raw = await FileSystem.readAsStringAsync(sharedFile.uri)
        } else {
          // Android content:// URI — copy to cache first
          const tempUri = FileSystem.cacheDirectory + 'shared_' + Date.now() + '.md'
          await FileSystem.copyAsync({ from: sharedFile.uri, to: tempUri })
          raw = await FileSystem.readAsStringAsync(tempUri)
          FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {})
        }
      }
    } catch {
      // If reading fails, fall back to AddPost which has its own error handling
      navigationRef.navigate('AddPost', { sharedFile, sharedAt: Date.now() })
      return
    }

    navigationRef.navigate('PostEditor', {
      raw,
      filename,
      siteId: 'temporal',
    })
  }, [])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        openSharedFile()
      }
    })

    return () => {
      subscription.remove()
    }
  }, [openSharedFile])

  return (
    <NavigationContainer ref={navigationRef} onReady={openSharedFile}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="AddPost" component={AddPostScreen} />
        <Stack.Screen name="PostEditor" component={PostEditorScreen} />
        <Stack.Screen name="Push" component={PushScreen} />
        <Stack.Screen name="RepoBrowser" component={RepoBrowserScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="FormatReference" component={FormatReferenceScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
