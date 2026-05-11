// Mirrors user-mobile-app/src/theme/colors.ts so the family of Martino Noir
// apps shares one visual language.
export const colors = {
  primary: {
    900: '#0B3D91',
    800: '#14509E',
    700: '#1E5FCC',
    600: '#3474D4',
    500: '#4A90E2',
    400: '#6BA5EA',
    300: '#93BFF0',
    200: '#BDD7F6',
    100: '#EEF4FC',
    50: '#F7FAFE',
  },
  ink: {
    900: '#0A0A0A',
    800: '#141414',
    700: '#1F2933',
    600: '#3B4754',
    500: '#5A6775',
    400: '#7B8794',
    300: '#9AA5B1',
    200: '#CBD2D9',
    100: '#E4E7EB',
  },
  surface: {
    0: '#FFFFFF',
    1: '#F6F9FD',
    2: '#EDF1F7',
  },
  rule: '#D0D7DE',
  success: '#0E7C3A',
  successLight: '#E6F4EC',
  warning: '#B54708',
  warningLight: '#FFF4E5',
  danger: '#B42318',
  dangerLight: '#FEF3F2',
  accentGold: '#C9A96E',
  accentGoldLight: '#F5EDE0',
  accentGoldDark: '#8B6914',
} as const;

export type Colors = typeof colors;
