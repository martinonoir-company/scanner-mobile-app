import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import {
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
import { ApiError, DispatchOrder } from '@/lib/api-types';
import { colors, radius, spacing, text } from '@/theme';

type ResultState =
  | { status: 'idle' }
  | { status: 'loading'; code: string }
  | { status: 'done'; order: DispatchOrder }
  | { status: 'error'; code: string; message: string };

/**
 * Scan an order barcode (the order number printed on the receipt /
 * shown on the POS dispatch detail) to mark it DISPATCHED — i.e. handed to
 * the AAJ courier. Idempotent server-side, so re-scanning is safe.
 */
export default function DispatchScanScreen() {
  const [result, setResult] = useState<ResultState>({ status: 'idle' });
  const [manualCode, setManualCode] = useState('');
  const inFlightRef = useRef(false);

  const scannerActive = result.status === 'idle';

  const run = useCallback(async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || inFlightRef.current) return;
    inFlightRef.current = true;
    setResult({ status: 'loading', code });
    try {
      const res = await api.markOrderDispatched(code);
      setResult({ status: 'done', order: res.data });
    } catch (err) {
      const apiErr = err as Partial<ApiError>;
      const msg = Array.isArray(apiErr?.message)
        ? apiErr.message[0] ?? 'Could not dispatch'
        : (apiErr?.message as string | undefined) ?? 'Could not dispatch';
      setResult({ status: 'error', code, message: msg });
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const handleScan = useCallback((data: string) => void run(data), [run]);

  const handleManual = useCallback(() => {
    const code = manualCode.trim();
    if (!code) return;
    void run(code);
    setManualCode('');
  }, [manualCode, run]);

  const reset = useCallback(() => setResult({ status: 'idle' }), []);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.cameraArea}>
        <BarcodeScanner
          onScan={handleScan}
          active={scannerActive}
          hint="Scan the order barcode to mark it dispatched"
          showManualEntry={false}
        />
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.manualRow}>
          <TextInput
            value={manualCode}
            onChangeText={setManualCode}
            placeholder="Enter order number"
            placeholderTextColor={colors.ink[300]}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleManual}
            style={styles.manualInput}
          />
          <Button
            title="Dispatch"
            size="md"
            onPress={handleManual}
            disabled={!manualCode.trim()}
            icon={<Ionicons name="rocket" size={14} color="#fff" />}
          />
        </View>

        {result.status === 'loading' ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>Dispatching “{result.code}”…</Text>
          </View>
        ) : null}

        {result.status === 'error' ? (
          <View style={[styles.statusBox, styles.statusBoxError]}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>Couldn’t dispatch</Text>
              <Text style={styles.statusBody}>{result.message}</Text>
            </View>
            <Pressable onPress={reset} hitSlop={8}>
              <Text style={styles.retryLink}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {result.status === 'done' ? (
          <View style={{ gap: spacing[3] }}>
            <View style={[styles.statusBox, styles.statusBoxDone]}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>
                  {result.order.orderNumber} dispatched
                </Text>
                <Text style={styles.statusBody}>
                  Handed off for courier pickup.
                </Text>
              </View>
            </View>
            <Button
              title="Scan another"
              variant="outline"
              size="lg"
              fullWidth
              onPress={reset}
              icon={<Ionicons name="scan" size={16} color={colors.ink[900]} />}
            />
          </View>
        ) : null}

        {result.status === 'idle' ? (
          <Text style={styles.idleHint}>
            Scan the order barcode (on the receipt or POS dispatch screen), or
            type the order number, to mark it as dispatched.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface[0] },
  cameraArea: { flex: 1, minHeight: 280 },
  sheet: {
    maxHeight: '52%',
    backgroundColor: colors.surface[0],
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    marginTop: -radius['2xl'],
  },
  sheetContent: { padding: spacing[4], gap: spacing[4] },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: 12,
    backgroundColor: colors.surface[1],
    color: colors.ink[900],
    minHeight: 48,
    ...text.base,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    backgroundColor: colors.surface[1],
    borderRadius: radius.lg,
    padding: spacing[3],
  },
  statusBoxError: { backgroundColor: colors.dangerLight },
  statusBoxDone: { backgroundColor: colors.successLight },
  statusTitle: { ...text.sm, fontWeight: '700', color: colors.ink[900] },
  statusBody: { ...text.sm, color: colors.ink[600], marginTop: 2 },
  statusText: { ...text.sm, color: colors.ink[600] },
  retryLink: { ...text.sm, color: colors.ink[900], fontWeight: '700' },
  idleHint: { ...text.sm, color: colors.ink[400], lineHeight: 22 },
});
