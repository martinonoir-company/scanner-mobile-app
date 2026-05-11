import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

export function LoadingView() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.ink[900]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
