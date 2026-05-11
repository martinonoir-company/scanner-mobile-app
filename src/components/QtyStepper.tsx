import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, text } from '@/theme';

interface Props {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  /** Minimum value reachable via the minus button before it removes the line. */
  min?: number;
}

export function QtyStepper({ value, onIncrement, onDecrement, min = 0 }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onDecrement}
        hitSlop={6}
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
      >
        <Ionicons
          name={value <= min + 1 ? 'trash-outline' : 'remove'}
          size={16}
          color={value <= min + 1 ? colors.danger : colors.ink[900]}
        />
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable
        onPress={onIncrement}
        hitSlop={6}
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
      >
        <Ionicons name="add" size={16} color={colors.ink[900]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  btn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surface[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    ...text.base,
    fontWeight: '700',
    color: colors.ink[900],
    minWidth: 28,
    textAlign: 'center',
  },
});
