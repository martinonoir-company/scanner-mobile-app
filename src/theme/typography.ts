import { Platform, TextStyle } from 'react-native';

// Native platforms don't load the web fonts; fall back to system serif/sans.
const display: TextStyle['fontFamily'] = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});

const body: TextStyle['fontFamily'] = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

export const fonts = { display, body } as const;

export const text = {
  xs: { fontSize: 12, lineHeight: 18 },
  sm: { fontSize: 14, lineHeight: 21 },
  base: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 27 },
  xl: { fontSize: 20, lineHeight: 28 },
  '2xl': { fontSize: 24, lineHeight: 32 },
  '3xl': { fontSize: 30, lineHeight: 36 },
  '4xl': { fontSize: 36, lineHeight: 44 },
  '5xl': { fontSize: 44, lineHeight: 52 },
} as const;
