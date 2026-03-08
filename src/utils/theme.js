import { useMemo } from 'react'
import { useColorScheme } from 'react-native'
import {
  DefaultTheme as NavigationDefaultTheme,
  DarkTheme as NavigationDarkTheme,
} from '@react-navigation/native'

const palettes = {
  light: {
    mode: 'light',
    background: '#f4f2ec',
    backgroundAlt: '#f0f4f0',
    hero: '#efe7d8',
    surface: '#ffffff',
    surfaceAlt: '#f8faf8',
    surfaceMuted: '#eef6f1',
    border: '#e0e6df',
    borderStrong: '#d7ddda',
    header: '#1a3a2a',
    headerText: '#ffffff',
    text: '#1a2e1a',
    textStrong: '#2b2318',
    textMuted: '#6f7b74',
    textSoft: '#888888',
    accent: '#2d6a4f',
    accentSoft: '#aed8c0',
    link: '#4a90d9',
    warning: '#e67e22',
    danger: '#e74c3c',
    dangerSoft: '#ff8080',
    codeBg: '#1a2e1a',
    codeText: '#aed8c0',
    inputBg: '#ffffff',
    inputText: '#1a2e1a',
    placeholder: '#9aa5a0',
    overlay: '#e0e8e0',
    imagePanel: '#f7f3ea',
    badgeBg: '#eef2ee',
    badgeText: '#6f7b74',
  },
  dark: {
    mode: 'dark',
    background: '#0f1412',
    backgroundAlt: '#121917',
    hero: '#171f1b',
    surface: '#1a2320',
    surfaceAlt: '#202a26',
    surfaceMuted: '#22312b',
    border: '#2a3732',
    borderStrong: '#34433d',
    header: '#0a0f0d',
    headerText: '#f2f6f3',
    text: '#edf3ee',
    textStrong: '#f4efe5',
    textMuted: '#a4b0a8',
    textSoft: '#7d8b83',
    accent: '#69a884',
    accentSoft: '#8dc7a6',
    link: '#7db3ff',
    warning: '#f0a85a',
    danger: '#ff8a8a',
    dangerSoft: '#ff9f9f',
    codeBg: '#0b1110',
    codeText: '#b5dfc6',
    inputBg: '#111816',
    inputText: '#edf3ee',
    placeholder: '#7b8881',
    overlay: '#24302c',
    imagePanel: '#2a231c',
    badgeBg: '#24312c',
    badgeText: '#b4c1b9',
  },
}

export function getTheme(mode = 'light') {
  const palette = palettes[mode === 'dark' ? 'dark' : 'light']
  return {
    dark: palette.mode === 'dark',
    colors: palette,
  }
}

export function useAppTheme() {
  const scheme = useColorScheme()
  return useMemo(() => getTheme(scheme === 'dark' ? 'dark' : 'light'), [scheme])
}

export function getNavigationTheme(theme) {
  const base = theme?.dark ? NavigationDarkTheme : NavigationDefaultTheme
  return {
    ...base,
    colors: {
      ...base.colors,
      background: theme.colors.background,
      card: theme.colors.header,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.accent,
      notification: theme.colors.warning,
    },
  }
}

export function alpha(hex, suffix) {
  return `${hex}${suffix}`
}
