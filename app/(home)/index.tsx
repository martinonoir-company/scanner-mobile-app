import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ActionCard } from '@/components/ActionCard';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/lib/auth-context';
import { useBranch } from '@/lib/branch-context';
import { colors, radius, spacing, text } from '@/theme';

/**
 * Scanner home screen.
 *
 * Layout per SCANNER_APP_PLAN.md §5.4:
 *   - Header: branch indicator (tap to switch when multi-branch) + sign out.
 *   - Two LARGE primary action cards: POS Checkout, Restock / Receive.
 *   - Three secondary cards in a row: Returns, Dispatch, Lookup.
 *
 * PR #8 wires the navigation targets — the destination screens themselves
 * land in PRs #9, #10, #12, #14. Tapping any flow today shows a friendly
 * "coming soon" toast so QA can validate routing + UI without crashes.
 */
export default function HomeScreen() {
  const { user, logout } = useAuth();
  const { selected, branches, clearSelection } = useBranch();

  const hasMultipleBranches = branches.length > 1;

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const handleSwitchBranch = async () => {
    if (!hasMultipleBranches) return;
    await clearSelection();
    router.replace('/branch/select');
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'You will be signed out of the scanner.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  // PR #8 stub — replaced as each flow lands.
  const notReadyYet = (flow: string) => {
    Alert.alert(
      `${flow} coming soon`,
      'This flow lands in a follow-up release. Routing and UI are already wired so the team can validate now.',
    );
  };

  return (
    <Screen padded={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Branch + user header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleSwitchBranch}
            disabled={!hasMultipleBranches}
            style={({ pressed }) => [
              styles.branchPill,
              pressed && hasMultipleBranches && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              hasMultipleBranches
                ? `Switch branch (current: ${selected?.name})`
                : `Branch ${selected?.name}`
            }
          >
            <Ionicons
              name="business-outline"
              size={14}
              color={colors.ink[700]}
            />
            <Text style={styles.branchText} numberOfLines={1}>
              {selected?.name ?? 'No branch'}
            </Text>
            {hasMultipleBranches ? (
              <Ionicons
                name="chevron-down"
                size={14}
                color={colors.ink[500]}
              />
            ) : null}
          </Pressable>

          <Pressable
            onPress={handleLogout}
            hitSlop={10}
            style={styles.signOutBtn}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Ionicons
              name="log-out-outline"
              size={20}
              color={colors.ink[700]}
            />
          </Pressable>
        </View>

        {/* Greeting */}
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>{greeting},</Text>
          <Text style={styles.greetingName} numberOfLines={1}>
            {user?.firstName ?? 'team'}
          </Text>
        </View>

        {/* Primary actions */}
        <View style={styles.primaryRow}>
          <ActionCard
            title="POS Checkout"
            description="Scan items into the active POS terminal."
            icon="cart"
            variant="primary"
            onPress={() => notReadyYet('POS Checkout')}
          />
          <ActionCard
            title="Restock / Receive"
            description="Receive a supplier delivery."
            icon="cube"
            variant="primary"
            onPress={() => notReadyYet('Restock / Receive')}
          />
        </View>

        {/* Secondary actions */}
        <Text style={styles.sectionLabel}>More</Text>
        <View style={styles.secondaryRow}>
          <ActionCard
            title="Returns"
            description="Damaged or returned items"
            icon="arrow-undo"
            variant="secondary"
            onPress={() => notReadyYet('Returns')}
          />
          <ActionCard
            title="Dispatch"
            description="Hand off to courier"
            icon="rocket"
            variant="secondary"
            onPress={() => notReadyYet('Dispatch')}
          />
        </View>
        <View style={styles.secondaryRow}>
          <ActionCard
            title="Lookup"
            description="Price & stock check"
            icon="search"
            variant="secondary"
            onPress={() => notReadyYet('Lookup')}
          />
          {/* Single card on its own line keeps the grid tidy. */}
          <View style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[10],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[5],
  },
  branchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: colors.surface[1],
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    maxWidth: '80%',
  },
  branchText: {
    ...text.sm,
    color: colors.ink[900],
    fontWeight: '600',
    flexShrink: 1,
  },
  signOutBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface[1],
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingBlock: { marginBottom: spacing[6] },
  greeting: { ...text.lg, color: colors.ink[500] },
  greetingName: {
    ...text['3xl'],
    fontWeight: '700',
    color: colors.ink[900],
    letterSpacing: -0.5,
  },
  primaryRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[6],
  },
  sectionLabel: {
    ...text.xs,
    color: colors.ink[500],
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing[3],
    textTransform: 'uppercase',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
});
