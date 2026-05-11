import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Button } from '@/components/Button';
import { QtyStepper } from '@/components/QtyStepper';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBranch } from '@/lib/branch-context';
import { formatMinor, formatOptions } from '@/lib/format';
import {
  useCheckoutSession,
  type CheckoutScanFeedback,
} from '@/lib/use-checkout-session';
import { colors, radius, spacing, text } from '@/theme';

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function FeedbackBanner({ feedback }: { feedback: CheckoutScanFeedback }) {
  if (!feedback) return null;
  let tone: {
    bg: string;
    color: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
  };
  let textStr: string;
  switch (feedback.kind) {
    case 'added':
      tone = { bg: colors.successLight, color: colors.success, icon: 'checkmark-circle' };
      textStr = `Added ${feedback.productName}`;
      break;
    case 'incremented':
      tone = { bg: colors.successLight, color: colors.success, icon: 'add-circle' };
      textStr = `${feedback.productName} → ${feedback.quantity}`;
      break;
    case 'not-found':
      tone = { bg: colors.warningLight, color: colors.warning, icon: 'help-circle' };
      textStr = `Unknown barcode “${feedback.code}”`;
      break;
    case 'error':
      tone = { bg: colors.dangerLight, color: colors.danger, icon: 'alert-circle' };
      textStr = feedback.message;
      break;
  }
  return (
    <View style={[styles.banner, { backgroundColor: tone.bg }]}>
      <Ionicons name={tone.icon} size={16} color={tone.color} />
      <Text style={[styles.bannerText, { color: tone.color }]} numberOfLines={2}>
        {textStr}
      </Text>
    </View>
  );
}

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <View style={styles.connRow}>
      <View
        style={[
          styles.connDot,
          { backgroundColor: connected ? colors.success : colors.warning },
        ]}
      />
      <Text style={styles.connText}>
        {connected ? 'Live' : 'Reconnecting…'}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────

export default function CheckoutScanScreen() {
  const params = useLocalSearchParams<{
    terminalCode?: string;
    terminalName?: string;
  }>();
  const terminalCode = (params.terminalCode ?? '').toString();
  const terminalName = (params.terminalName ?? terminalCode).toString();

  const { selected } = useBranch();
  const accessToken = api.getAccessToken();

  const checkout = useCheckoutSession(terminalCode, accessToken);

  // Camera dispatches scans only while we're actively building AND not
  // mid-mutation.
  const scannerActive = checkout.phase === 'building' && !checkout.busy;

  const handleScan = useCallback(
    (code: string) => checkout.handleScan(code),
    [checkout],
  );

  // After a sale completes, auto-return to a fresh basket after a beat so
  // floor staff get the confirmation then can keep going. (We don't auto-
  // navigate away — the user taps "New basket" or "Back".)
  useEffect(() => {
    // no-op placeholder for future auto-reset timing; kept explicit for
    // clarity. The completed screen has manual actions.
  }, [checkout.phase]);

  const confirmDiscardAndBack = useCallback(() => {
    if (checkout.phase === 'building' && (checkout.session?.cart.items.length ?? 0) > 0) {
      Alert.alert(
        'Cancel this basket?',
        `${checkout.session?.cart.items.length} item${(checkout.session?.cart.items.length ?? 0) === 1 ? '' : 's'} will be discarded.`,
        [
          { text: 'Keep building', style: 'cancel' },
          {
            text: 'Cancel basket',
            style: 'destructive',
            onPress: () => {
              checkout.voidBasket('Cancelled on scanner');
              router.back();
            },
          },
        ],
      );
      return;
    }
    router.back();
  }, [checkout]);

  const cart = checkout.session?.cart;
  const items = cart?.items ?? [];
  const itemCount = items.reduce((s, l) => s + l.quantity, 0);

  // ── Phase: opening ──
  if (checkout.phase === 'opening') {
    return (
      <SafeAreaView style={styles.statusRoot}>
        <Ionicons name="hourglass-outline" size={36} color={colors.ink[300]} />
        <Text style={styles.statusTitle}>Opening terminal…</Text>
        <Text style={styles.statusBody}>{terminalName}</Text>
      </SafeAreaView>
    );
  }

  // ── Phase: open-failed ──
  if (checkout.phase === 'open-failed') {
    return (
      <SafeAreaView style={styles.statusRoot}>
        <Ionicons name="alert-circle-outline" size={36} color={colors.danger} />
        <Text style={styles.statusTitle}>Couldn’t open the terminal</Text>
        <Text style={styles.statusBody}>
          {checkout.openError ??
            'The terminal may be busy with another basket. Try again in a moment.'}
        </Text>
        <View style={{ gap: spacing[2], width: '100%', marginTop: spacing[4] }}>
          <Button title="Try again" size="lg" fullWidth onPress={checkout.retryOpen} />
          <Button
            title="Back"
            variant="ghost"
            size="md"
            fullWidth
            onPress={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: awaiting-payment ──
  if (checkout.phase === 'awaiting-payment') {
    return (
      <SafeAreaView style={styles.statusRoot}>
        <View style={styles.awaitIcon}>
          <Ionicons name="card-outline" size={32} color={colors.ink[900]} />
        </View>
        <Text style={styles.statusTitle}>Sent to the till</Text>
        <Text style={styles.statusBody}>
          The cashier at {terminalName} is completing the sale. Hand over the
          items.
        </Text>

        {/* Basket summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLine}>
            {itemCount} item{itemCount === 1 ? '' : 's'} ·{' '}
            {formatMinor(cart?.totals.grandTotal, cart?.currency ?? 'NGN')}
          </Text>
        </View>

        <ConnectionDot connected={checkout.connected} />

        <Text style={styles.awaitHint}>
          Stay on this screen — it’ll show the order number once the cashier
          finishes.
        </Text>

        <Button
          title="Back to home"
          variant="ghost"
          size="md"
          onPress={() => router.replace('/(home)')}
          style={{ marginTop: spacing[4] }}
        />
      </SafeAreaView>
    );
  }

  // ── Phase: completed ──
  if (checkout.phase === 'completed') {
    return (
      <SafeAreaView style={styles.statusRoot}>
        <View style={[styles.awaitIcon, { backgroundColor: colors.successLight }]}>
          <Ionicons name="checkmark" size={32} color={colors.success} />
        </View>
        <Text style={styles.statusTitle}>Sale completed</Text>
        {checkout.completedOrderNumber ? (
          <Text style={styles.orderNumber}>
            Order #{checkout.completedOrderNumber}
          </Text>
        ) : null}
        <Text style={styles.statusBody}>
          The receipt prints at the till.
        </Text>
        <View style={{ gap: spacing[2], width: '100%', marginTop: spacing[5] }}>
          <Button
            title="New basket"
            size="lg"
            fullWidth
            onPress={checkout.startNewBasket}
            icon={<Ionicons name="scan" size={16} color="#fff" />}
          />
          <Button
            title="Back to home"
            variant="ghost"
            size="md"
            fullWidth
            onPress={() => router.replace('/(home)')}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: voided ──
  if (checkout.phase === 'voided') {
    return (
      <SafeAreaView style={styles.statusRoot}>
        <View style={[styles.awaitIcon, { backgroundColor: colors.warningLight }]}>
          <Ionicons name="close" size={32} color={colors.warning} />
        </View>
        <Text style={styles.statusTitle}>Basket cancelled</Text>
        <Text style={styles.statusBody}>
          {checkout.voidedReason ?? 'This basket was cancelled.'}
        </Text>
        <View style={{ gap: spacing[2], width: '100%', marginTop: spacing[5] }}>
          <Button
            title="New basket"
            size="lg"
            fullWidth
            onPress={checkout.startNewBasket}
          />
          <Button
            title="Back to home"
            variant="ghost"
            size="md"
            fullWidth
            onPress={() => router.replace('/(home)')}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: building ──
  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.cameraArea}>
        <BarcodeScanner
          onScan={handleScan}
          active={scannerActive}
          hint="Scan each item the customer is buying"
        />
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Context bar */}
        <View style={styles.contextRow}>
          <View style={styles.terminalChip}>
            <Ionicons name="desktop" size={12} color={colors.ink[700]} />
            <Text style={styles.terminalChipText} numberOfLines={1}>
              {terminalName}
            </Text>
          </View>
          <ConnectionDot connected={checkout.connected} />
        </View>

        <FeedbackBanner feedback={checkout.feedback} />

        {/* Cart */}
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="scan-outline" size={28} color={colors.ink[300]} />
            <Text style={styles.emptyText}>
              Point the camera at an item to start the basket.
            </Text>
          </View>
        ) : (
          <View style={styles.cartList}>
            {items.map((line) => {
              const optionsStr = formatOptions(line.options);
              const lineTotal = line.unitPrice * line.quantity;
              return (
                <View key={line.clientLineId} style={styles.cartRow}>
                  <View style={styles.thumb}>
                    {line.imageUrl ? (
                      <Image
                        source={{ uri: line.imageUrl }}
                        style={styles.thumbImg}
                        contentFit="cover"
                        transition={100}
                      />
                    ) : (
                      <Ionicons
                        name="pricetag-outline"
                        size={18}
                        color={colors.ink[300]}
                      />
                    )}
                  </View>
                  <View style={styles.cartBody}>
                    <Text style={styles.cartName} numberOfLines={1}>
                      {line.productName}
                    </Text>
                    <Text style={styles.cartMeta} numberOfLines={1}>
                      {line.variantName ?? ''}
                      {line.variantName && optionsStr ? ' · ' : ''}
                      {optionsStr || `SKU ${line.sku}`}
                    </Text>
                    <Text style={styles.cartPrice}>
                      {formatMinor(line.unitPrice, cart?.currency ?? 'NGN')} ×{' '}
                      {line.quantity} ={' '}
                      <Text style={styles.cartLineTotal}>
                        {formatMinor(lineTotal, cart?.currency ?? 'NGN')}
                      </Text>
                    </Text>
                  </View>
                  <QtyStepper
                    value={line.quantity}
                    onIncrement={() => checkout.incrementLine(line.clientLineId)}
                    onDecrement={() => checkout.decrementLine(line.clientLineId)}
                  />
                </View>
              );
            })}
          </View>
        )}

        {/* Totals */}
        {items.length > 0 ? (
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>
                {formatMinor(cart?.totals.subtotal, cart?.currency ?? 'NGN')}
              </Text>
            </View>
            <View style={[styles.totalsRow, styles.totalsRowGrand]}>
              <Text style={styles.totalsGrandLabel}>Total</Text>
              <Text style={styles.totalsGrandValue}>
                {formatMinor(cart?.totals.grandTotal, cart?.currency ?? 'NGN')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title={
              itemCount > 0
                ? `Ready for payment · ${itemCount} item${itemCount === 1 ? '' : 's'}`
                : 'Ready for payment'
            }
            size="lg"
            fullWidth
            disabled={items.length === 0 || checkout.busy}
            loading={checkout.busy && items.length > 0 && checkout.phase === 'building'}
            onPress={checkout.readyForPayment}
            icon={<Ionicons name="arrow-forward" size={16} color="#fff" />}
          />
          <Text style={styles.handoffHint}>
            Payment is taken at the till — this hands the basket to the
            cashier.
          </Text>
          <Button
            title="Cancel basket"
            variant="ghost"
            size="md"
            fullWidth
            onPress={confirmDiscardAndBack}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface[0] },
  statusRoot: {
    flex: 1,
    backgroundColor: colors.surface[0],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    gap: spacing[3],
  },
  statusTitle: {
    ...text['2xl'],
    fontWeight: '700',
    color: colors.ink[900],
    textAlign: 'center',
  },
  statusBody: {
    ...text.base,
    color: colors.ink[500],
    textAlign: 'center',
    lineHeight: 24,
  },
  orderNumber: {
    ...text.xl,
    fontWeight: '700',
    color: colors.ink[900],
    fontFamily: undefined,
  },
  awaitIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.surface[1],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  summaryCard: {
    backgroundColor: colors.surface[1],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginTop: spacing[2],
  },
  summaryLine: { ...text.base, fontWeight: '600', color: colors.ink[900] },
  awaitHint: {
    ...text.sm,
    color: colors.ink[400],
    textAlign: 'center',
    marginTop: spacing[3],
  },

  cameraArea: { flex: 1, minHeight: 220 },
  sheet: {
    maxHeight: '60%',
    backgroundColor: colors.surface[0],
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    marginTop: -radius['2xl'],
  },
  sheetContent: { padding: spacing[4], gap: spacing[4] },

  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  terminalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    backgroundColor: colors.surface[1],
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    maxWidth: '60%',
  },
  terminalChipText: { ...text.xs, color: colors.ink[700], fontWeight: '600', flexShrink: 1 },
  connRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  connDot: { width: 8, height: 8, borderRadius: 4 },
  connText: { ...text.xs, color: colors.ink[500], fontWeight: '600' },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.lg,
  },
  bannerText: { ...text.sm, fontWeight: '600', flex: 1 },

  empty: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[8] },
  emptyText: { ...text.sm, color: colors.ink[400], textAlign: 'center' },

  cartList: { gap: spacing[2] },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: colors.surface[1],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface[2],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },
  cartBody: { flex: 1 },
  cartName: { ...text.sm, fontWeight: '700', color: colors.ink[900] },
  cartMeta: { ...text.xs, color: colors.ink[500], marginTop: 2 },
  cartPrice: { ...text.xs, color: colors.ink[500], marginTop: 4 },
  cartLineTotal: { color: colors.ink[900], fontWeight: '700' },

  totalsBox: {
    backgroundColor: colors.surface[1],
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[2],
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalsRowGrand: {
    borderTopWidth: 1,
    borderTopColor: colors.ink[100],
    paddingTop: spacing[2],
    marginTop: spacing[1],
  },
  totalsLabel: { ...text.sm, color: colors.ink[500] },
  totalsValue: { ...text.sm, color: colors.ink[900], fontWeight: '600' },
  totalsGrandLabel: { ...text.base, color: colors.ink[900], fontWeight: '700' },
  totalsGrandValue: { ...text.lg, color: colors.ink[900], fontWeight: '700' },

  actions: { gap: spacing[2], marginTop: spacing[2] },
  handoffHint: {
    ...text.xs,
    color: colors.ink[400],
    textAlign: 'center',
  },
});
