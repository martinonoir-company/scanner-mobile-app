import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { api } from '@/lib/api';
import { DispatchOrder } from '@/lib/api-types';
import { formatMinor } from '@/lib/format';
import { colors, radius, spacing, text } from '@/theme';

type Filter = 'PENDING' | 'DISPATCHED' | '';

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Dispatched', value: 'DISPATCHED' },
  { label: 'All', value: '' },
];

/**
 * Dispatch list — shipping orders to sort for AAJ pickup. Filter by status
 * with pagination ("load more"). Tapping an order, or the big Scan button,
 * goes to the scan screen to mark orders dispatched.
 */
export default function DispatchListScreen() {
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const res = await api.fetchDispatchQueue({
          page: nextPage,
          dispatchStatus: filter || undefined,
        });
        setOrders((prev) =>
          replace ? res.data.items : [...prev, ...res.data.items],
        );
        setPage(res.data.page);
        setPages(res.data.pages);
        setTotal(res.data.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dispatch queue');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    void load(1, true);
  }, [load]);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      {/* Filters */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            onPress={() => setFilter(f.value)}
            style={[styles.filterChip, filter === f.value && styles.filterChipOn]}
          >
            <Text
              style={[
                styles.filterText,
                filter === f.value && styles.filterTextOn,
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ink[900]} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => load(1, true)}>
            <Text style={styles.retryLink}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={styles.countLine}>
              {total} order{total !== 1 ? 's' : ''}
            </Text>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No dispatch orders.</Text>
          }
          renderItem={({ item }) => <OrderRow order={item} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!loadingMore && page < pages) void load(page + 1, false);
          }}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                color={colors.ink[500]}
                style={{ marginVertical: spacing[4] }}
              />
            ) : null
          }
        />
      )}

      {/* Scan CTA */}
      <View style={styles.footer}>
        <Button
          title="Scan order to dispatch"
          size="lg"
          fullWidth
          onPress={() => router.push('/dispatch/scan' as never)}
          icon={<Ionicons name="scan" size={16} color="#fff" />}
        />
      </View>
    </SafeAreaView>
  );
}

function OrderRow({ order }: { order: DispatchOrder }) {
  const addr = order.shippingAddress;
  const name = addr
    ? `${addr.firstName ?? ''} ${addr.lastName ?? ''}`.trim() || '—'
    : '—';
  const dest = addr
    ? [addr.city, addr.state].filter(Boolean).join(', ')
    : '';
  const dispatched = order.dispatchStatus === 'DISPATCHED';
  const units = order.items.reduce((s, i) => s + (i.quantity ?? 0), 0);

  return (
    <Pressable
      onPress={() => router.push('/dispatch/scan' as never)}
      style={styles.row}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.orderNo}>{order.orderNumber}</Text>
          <View
            style={[
              styles.badge,
              dispatched ? styles.badgeDone : styles.badgePending,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                dispatched ? styles.badgeTextDone : styles.badgeTextPending,
              ]}
            >
              {dispatched ? 'Dispatched' : 'Pending'}
            </Text>
          </View>
        </View>
        <Text style={styles.customer}>{name}</Text>
        {dest ? <Text style={styles.dest}>{dest}</Text> : null}
        <Text style={styles.meta}>
          {order.items.length} line{order.items.length !== 1 ? 's' : ''} · {units} units ·{' '}
          {formatMinor(order.grandTotal, order.currency as 'NGN' | 'USD')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ink[300]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface[0] },
  filterRow: {
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[4],
    paddingBottom: spacing[2],
  },
  filterChip: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radius.full,
    backgroundColor: colors.surface[1],
  },
  filterChipOn: { backgroundColor: colors.ink[900] },
  filterText: { ...text.sm, color: colors.ink[600], fontWeight: '600' },
  filterTextOn: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3] },
  errorText: { ...text.sm, color: colors.danger, textAlign: 'center', paddingHorizontal: spacing[6] },
  retryLink: { ...text.sm, color: colors.ink[900], fontWeight: '700' },
  listContent: { padding: spacing[4], paddingTop: spacing[2], gap: spacing[3] },
  countLine: { ...text.xs, color: colors.ink[400], marginBottom: spacing[2] },
  empty: { ...text.sm, color: colors.ink[400], textAlign: 'center', marginTop: spacing[8] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: colors.surface[1],
    borderRadius: radius.lg,
    padding: spacing[4],
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  orderNo: { ...text.base, fontWeight: '700', color: colors.ink[900] },
  customer: { ...text.sm, color: colors.ink[700] },
  dest: { ...text.xs, color: colors.ink[500] },
  meta: { ...text.xs, color: colors.ink[400], marginTop: 2 },
  badge: { paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: radius.full },
  badgePending: { backgroundColor: colors.warningLight },
  badgeDone: { backgroundColor: colors.successLight },
  badgeText: { ...text.xs, fontWeight: '700' },
  badgeTextPending: { color: colors.warning },
  badgeTextDone: { color: colors.success },
  footer: {
    padding: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.ink[100],
  },
});
