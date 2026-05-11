import React, { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, radius, spacing, text } from '@/theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, hint, required, onFocus, onBlur, style, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const handleFocus: NonNullable<TextInputProps['onFocus']> = (e) => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur: NonNullable<TextInputProps['onBlur']> = (e) => {
    setFocused(false);
    onBlur?.(e);
  };

  return (
    <View>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.ink[300]}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.input,
          focused && {
            borderColor: colors.ink[900],
            backgroundColor: colors.surface[0],
          },
          error
            ? { borderColor: colors.danger, backgroundColor: colors.dangerLight }
            : null,
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    ...text.xs,
    fontWeight: '600',
    color: colors.ink[600],
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: 14,
    backgroundColor: colors.surface[1],
    color: colors.ink[900],
    minHeight: 52,
    ...text.base,
  },
  hint: {
    ...text.xs,
    color: colors.ink[400],
    marginTop: 4,
  },
  error: {
    ...text.xs,
    color: colors.danger,
    marginTop: 4,
  },
});
