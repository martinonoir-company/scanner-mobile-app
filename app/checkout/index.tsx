import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingView } from '@/components/LoadingView';
import { api } from '@/lib/api';
import { ApiError, Terminal } from '@/lib/api-types';
import { useBranch } from '@/lib/branch-context';
import { colors, radius, spacing, text } from '@/theme';

/**
 * Terminal picker for the POS-checkout flow. Lists active terminals at
 * the selected branch. If there's exactly one, auto-navigates to it.
 */
export default function CheckoutTerminalPicker() {
  const { selected } = useBranch();
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoNavigated, setAutoNavigated] = useState(false);

  const load = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listTerminals(selected.id);
      const active = res.data.filter((t) => t.isActive);
      setTerminals(active);
      // Exactly one terminal → skip the picker.
      if (active.length === 1 && !autoNavigated) {
        setAutoNavigated(true);
        router.replace({
          pathname: '/checkout/scan',
          params: { terminalCode: active[0]!.code, terminalName: active[0]!.name },
        });
      }
    } catch (err) {
      const apiErr = err as Partial<ApiError>;
      setError(
        Array.isArray(apiErr?.message)
          ? apiErr.message[0] ?? 'Failed to load terminals'
          : (apiErr?.message as string | undefined) ??
              'Failed to load terminals',
      );
    } finally {
      setLoading(false);
    }
  }, [selected, autoNavigated]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && terminals.length === 0) {
    return <LoadingView />;
  }

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Pick a terminal</Text>
          <Text style={styles.subtitle}>
            {selected?.name} · choose the till you're working with.
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!loading && terminals.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="desktop-outline" size={32} color={colors.ink[300]} />
            <Text style={styles.emptyTitle}>No terminals at this branch</Text>
            <Text style={styles.emptyBody}>
              Ask an administrator to add a terminal to this branch from the
              admin portal.
            </Text>
          </View>
        ) : null}

        <View style={styles.list}>
          {terminals.map((t) => (
            <Pressable
              key={t.id}
              onPress={() =>
                router.push({
                  pathname: '/checkout/scan',
                  params: { terminalCode: t.code, terminalName: t.name },
                })
              }
              style={({ pressed }) => [
                styles.row,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Use terminal ${t.name}`}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="desktop" size={20} color={colors.ink[900]} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{t.name}</Text>
                <Text style={styles.rowMeta}>{t.code}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.ink[300]}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface[0] },
  scroll: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[10],
    gap: spacing[4],
  },
  header: { marginTop: spacing[4], gap: spacing[2] },
  title: {
    ...text['3xl'],
    fontWeight: '700',
    color: colors.ink[900],
    letterSpacing: -0.5,
  },
  subtitle: { ...text.base, color: colors.ink[500] },
  list: { gap: spacing[3] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: colors.surface[1],
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.xl,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowTitle: { ...text.base, fontWeight: '700', color: colors.ink[900] },
  rowMeta: { ...text.sm, color: colors.ink[500], marginTop: 2 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: colors.dangerLight,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: radius.lg,
  },
  errorText: { ...text.sm, color: colors.danger, flex: 1 },
  empty: {
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[4],
  },
  emptyTitle: { ...text.lg, fontWeight: '700', color: colors.ink[900] },
  emptyBody: {
    ...text.sm,
    color: colors.ink[500],
    textAlign: 'center',
    lineHeight: 22,
  },
});
