import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import HomeScreen from './src/screens/HomeScreen'
import AddPostScreen from './src/screens/AddPostScreen'
import PushScreen from './src/screens/PushScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import FormatReferenceScreen from './src/screens/FormatReferenceScreen'

const Stack = createNativeStackNavigator()

export default function App() {
  return (
    <NavigationContainer>
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
