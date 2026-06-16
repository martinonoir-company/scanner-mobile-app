import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Button } from '@/components/Button';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-types';
import { formatMinor } from '@/lib/format';
import { colors, radius, spacing, text } from '@/theme';

/**
 * Step 1 of the returns flow: ask which order is being returned.
 *
 * The cashier either scans the order-number barcode printed on the
 * receipt or types it in. We confirm the order with the customer
 * (showing items + grand total) before letting the cashier go on to
 * scan the returned items.
 *
 * Why this exists: without an order, a return is just stock coming back
 * — there is no payment to refund. Capturing the order here keeps the
 * existing barcode-scan UI on the next screen intact.
 */
export default function ReturnsStartScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Awaited<
    ReturnType<typeof api.lookupOrderForReturn>
  >['data'] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const resolve = useCallback(async (orderNumber: string) => {
    const trimmed = orderNumber.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setScanError(null);
    try {
      const res = await api.lookupOrderForReturn(trimmed);
      setOrder(res.data);
    } catch (err) {
      const e = err as Partial<ApiError>;
      const msg =
        e.statusCode === 404
          ? `No order found for ${trimmed}. Check the receipt and try again.`
          : Array.isArray(e.message)
            ? e.message[0] ?? 'Could not look up order'
            : (e.message as string | undefined) ?? 'Could not look up order';
      setScanError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleScan = useCallback(
    (scanned: string) => {
      if (loading || order) return;
      setCode(scanned.trim().toUpperCase());
      void resolve(scanned);
    },
    [loading, order, resolve],
  );

  const proceed = useCallback(() => {
    if (!order) return;
    router.push({
      pathname: '/returns/batch',
      params: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        channel: order.channel,
      },
    });
  }, [order]);

  const reset = useCallback(() => {
    setOrder(null);
    setCode('');
    setScanError(null);
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.cameraArea}>
        <BarcodeScanner
          onScan={handleScan}
          active={!loading && !order}
          hint="Scan the order-number barcode from the customer's receipt"
        />
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        {!order ? (
          <>
            <Text style={styles.title}>Which order is this return for?</Text>
            <Text style={styles.subtitle}>
              Scan the barcode on the receipt, or type the order number.
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="e.g. MN-260616-00042"
                placeholderTextColor={colors.ink[300]}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.input}
                onSubmitEditing={() => resolve(code)}
                returnKeyType="search"
              />
              <Button
                title="Find"
                onPress={() => resolve(code)}
                disabled={!code.trim() || loading}
                loading={loading}
              />
            </View>

            {scanError && (
              <View style={styles.errorBox}>
                <Ionicons name="warning" size={14} color={colors.warning} />
                <Text style={styles.errorText}>{scanError}</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.orderHeader}>
              <View>
                <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
                <Text style={styles.orderMeta}>
                  {order.channel} · {order.status}
                </Text>
              </View>
              <View style={styles.totalCol}>
                <Text style={styles.totalLabel}>Paid</Text>
                <Text style={styles.totalValue}>
                  {formatMinor(order.grandTotal, order.currency as 'NGN' | 'USD')}
                </Text>
              </View>
            </View>

            {(order.customerName || order.customerPhone) && (
              <View style={styles.customer}>
                <Ionicons name="person" size={14} color={colors.ink[500]} />
                <Text style={styles.customerText} numberOfLines={1}>
                  {order.customerName ?? 'Customer'}
                  {order.customerPhone ? ` · ${order.customerPhone}` : ''}
                </Text>
              </View>
            )}

            <Text style={styles.itemsHeading}>Items on this order</Text>
            <View style={styles.itemsList}>
              {order.items.map((i) => (
                <View key={i.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {i.productName}
                      {i.variantName ? ` · ${i.variantName}` : ''}
                    </Text>
                    <Text style={styles.itemSku}>SKU {i.sku}</Text>
                  </View>
                  <Text style={styles.itemQty}>×{i.quantity}</Text>
                  <Text style={styles.itemPrice}>
                    {formatMinor(i.unitPrice, order.currency as 'NGN' | 'USD')}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.actions}>
              <Button
                title="Scan returned items"
                size="lg"
                fullWidth
                onPress={proceed}
                icon={<Ionicons name="scan" size={16} color="#fff" />}
              />
              <Button
                title="Different order"
                variant="ghost"
                size="md"
                fullWidth
                onPress={reset}
              />
            </View>
          </>
        )}
      </ScrollView>

      {loading && !order && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.ink[700]} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface[0] },
  cameraArea: { flex: 1, minHeight: 220 },
  sheet: {
    maxHeight: '62%',
    backgroundColor: colors.surface[0],
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    marginTop: -radius['2xl'],
  },
  sheetContent: { padding: spacing[4], gap: spacing[4] },
  title: { ...text.lg, fontWeight: '700', color: colors.ink[900] },
  subtitle: { ...text.sm, color: colors.ink[500] },
  inputRow: { flexDirection: 'row', gap: spacing[2], alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: 12,
    backgroundColor: colors.surface[1],
    color: colors.ink[900],
    ...text.base,
  },
  errorBox: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.warningLight,
  },
  errorText: { ...text.sm, color: colors.ink[800], flexShrink: 1 },

  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderNumber: { ...text.lg, fontWeight: '700', color: colors.ink[900] },
  orderMeta: { ...text.xs, color: colors.ink[500], marginTop: 2 },
  totalCol: { alignItems: 'flex-end' },
  totalLabel: { ...text.xs, color: colors.ink[500] },
  totalValue: { ...text.lg, fontWeight: '700', color: colors.ink[900] },

  customer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    backgroundColor: colors.surface[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.lg,
  },
  customerText: { ...text.sm, color: colors.ink[700], flexShrink: 1 },

  itemsHeading: { ...text.xs, color: colors.ink[500], fontWeight: '600' },
  itemsList: {
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.ink[100],
  },
  itemName: { ...text.sm, color: colors.ink[900], fontWeight: '600' },
  itemSku: { ...text.xs, color: colors.ink[500], marginTop: 2 },
  itemQty: { ...text.sm, color: colors.ink[600], fontVariant: ['tabular-nums'] },
  itemPrice: { ...text.sm, color: colors.ink[900], fontWeight: '600' },

  actions: { gap: spacing[2], marginTop: spacing[2] },

  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
