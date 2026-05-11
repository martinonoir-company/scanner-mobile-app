import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, text } from '@/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  onPress?: () => void;
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  onPress,
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconRight,
  fullWidth = false,
  style,
}: Props) {
  const isDisabled = disabled || loading;
  const stylesForVariant = variantStyles[variant];
  const stylesForSize = sizeStyles[size];

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        stylesForVariant.container,
        stylesForSize.container,
        fullWidth && { alignSelf: 'stretch' },
        pressed && !isDisabled && { opacity: 0.8 },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={stylesForVariant.text.color} />
        ) : (
          <>
            {icon}
            <Text style={[stylesForVariant.text, stylesForSize.text]}>{title}</Text>
            {iconRight}
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  disabled: {
    opacity: 0.55,
  },
});

const variantStyles = {
  primary: {
    container: { backgroundColor: colors.ink[900] },
    text: { color: '#fff', fontWeight: '600' as const, letterSpacing: 0.2 },
  },
  secondary: {
    container: { backgroundColor: colors.primary[700] },
    text: { color: '#fff', fontWeight: '600' as const, letterSpacing: 0.2 },
  },
  outline: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.ink[200],
    },
    text: { color: colors.ink[900], fontWeight: '600' as const, letterSpacing: 0.2 },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    text: { color: colors.ink[900], fontWeight: '600' as const, letterSpacing: 0.2 },
  },
  danger: {
    container: { backgroundColor: colors.danger },
    text: { color: '#fff', fontWeight: '600' as const, letterSpacing: 0.2 },
  },
} as const;

const sizeStyles = {
  sm: {
    container: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], minHeight: 36 },
    text: { ...text.sm },
  },
  md: {
    container: { paddingHorizontal: spacing[5], paddingVertical: spacing[3], minHeight: 44 },
    text: { ...text.sm },
  },
  lg: {
    container: { paddingHorizontal: spacing[6], paddingVertical: 16, minHeight: 52 },
    text: { ...text.base },
  },
} as const;
