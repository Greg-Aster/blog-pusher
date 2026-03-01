import React, { useCallback, useEffect } from 'react'
import { AppState } from 'react-native'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import HomeScreen from './src/screens/HomeScreen'
import AddPostScreen from './src/screens/AddPostScreen'
import PushScreen from './src/screens/PushScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import FormatReferenceScreen from './src/screens/FormatReferenceScreen'
import { consumeSharedFile } from './src/utils/shareIntent'

const Stack = createNativeStackNavigator()
const navigationRef = createNavigationContainerRef()

export default function App() {
  const openSharedFile = useCallback(async () => {
    if (!navigationRef.isReady()) return

    const sharedFile = await consumeSharedFile()
    if (!sharedFile) return

    navigationRef.navigate('AddPost', {
      sharedFile,
      sharedAt: Date.now(),
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
        <Stack.Screen name="Push" component={PushScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="FormatReference" component={FormatReferenceScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
