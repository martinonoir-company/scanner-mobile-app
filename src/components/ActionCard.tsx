import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radius, spacing, text } from '@/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  title: string;
  description?: string;
  icon: IoniconName;
  onPress: () => void;
  /** "primary" — large, dark, used for the two main actions on home. */
  /** "secondary" — smaller, light, used for the row below. */
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: ViewStyle;
}

export function ActionCard({
  title,
  description,
  icon,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
}: Props) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        isPrimary ? styles.primary : styles.secondary,
        pressed && !disabled && { opacity: 0.85 },
        disabled && { opacity: 0.45 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
    >
      <View
        style={[
          styles.iconWrap,
          isPrimary ? styles.iconWrapPrimary : styles.iconWrapSecondary,
        ]}
      >
        <Ionicons
          name={icon}
          size={isPrimary ? 32 : 22}
          color={isPrimary ? '#fff' : colors.ink[900]}
        />
      </View>
      <Text
        style={[
          isPrimary ? styles.titlePrimary : styles.titleSecondary,
        ]}
        numberOfLines={2}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={[
            isPrimary ? styles.descPrimary : styles.descSecondary,
          ]}
          numberOfLines={2}
        >
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    flex: 1,
    backgroundColor: colors.ink[900],
    borderRadius: radius['2xl'],
    padding: spacing[5],
    minHeight: 180,
    justifyContent: 'space-between',
  },
  secondary: {
    flex: 1,
    backgroundColor: colors.surface[1],
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.xl,
    padding: spacing[4],
    minHeight: 110,
    justifyContent: 'space-between',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapPrimary: {
    width: 56,
    height: 56,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  iconWrapSecondary: {
    width: 40,
    height: 40,
    backgroundColor: '#fff',
  },
  titlePrimary: {
    ...text.xl,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  descPrimary: {
    ...text.sm,
    color: 'rgba(255,255,255,0.7)',
  },
  titleSecondary: {
    ...text.base,
    color: colors.ink[900],
    fontWeight: '700',
  },
  descSecondary: {
    ...text.xs,
    color: colors.ink[500],
  },
});
