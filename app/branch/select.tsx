import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/lib/auth-context';
import { useBranch } from '@/lib/branch-context';
import { Branch } from '@/lib/api-types';
import { colors, radius, spacing, text } from '@/theme';

export default function BranchSelectScreen() {
  const { branches, isLoading, error, selectBranch, refresh } = useBranch();
  const { user, logout } = useAuth();

  const handleSelect = async (b: Branch) => {
    await selectBranch(b.id);
    router.replace('/(home)');
  };

  return (
    <Screen scroll padded={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Pick your branch</Text>
          <Text style={styles.subtitle}>
            Hi{user?.firstName ? `, ${user.firstName}` : ''}. Which branch
            are you working from today?
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!isLoading && branches.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="business-outline" size={32} color={colors.ink[300]} />
            <Text style={styles.emptyTitle}>No branches assigned</Text>
            <Text style={styles.emptyBody}>
              You're not assigned to any branch yet. Ask a Martino Noir
              administrator to add you to a branch from the admin portal.
            </Text>
            <Button
              title="Try again"
              variant="outline"
              size="md"
              onPress={refresh}
              style={{ marginTop: spacing[4] }}
            />
          </View>
        ) : null}

        <View style={styles.list}>
          {branches.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => handleSelect(b)}
              style={({ pressed }) => [
                styles.row,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Select branch ${b.name}`}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="business" size={20} color={colors.ink[900]} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {b.code}
                  {b.address?.city ? ` · ${b.address.city}` : ''}
                  {b.address?.state ? `, ${b.address.state}` : ''}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.ink[300]}
              />
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={logout}
          hitSlop={10}
          style={styles.signOut}
          accessibilityRole="button"
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[10],
    gap: spacing[4],
  },
  header: { marginTop: spacing[4], marginBottom: spacing[2] },
  title: {
    ...text['3xl'],
    fontWeight: '700',
    color: colors.ink[900],
    letterSpacing: -0.5,
    marginBottom: spacing[2],
  },
  subtitle: { ...text.base, color: colors.ink[500], lineHeight: 24 },
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
  rowTitle: {
    ...text.base,
    color: colors.ink[900],
    fontWeight: '700',
  },
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
  emptyBox: {
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[4],
  },
  emptyTitle: {
    ...text.lg,
    fontWeight: '700',
    color: colors.ink[900],
  },
  emptyBody: {
    ...text.sm,
    color: colors.ink[500],
    textAlign: 'center',
    lineHeight: 22,
  },
  signOut: {
    alignSelf: 'center',
    marginTop: spacing[6],
    paddingVertical: spacing[2],
  },
  signOutText: {
    ...text.sm,
    color: colors.ink[500],
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
