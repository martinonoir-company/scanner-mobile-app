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
import { VariantCard } from '@/components/VariantCard';
import { api } from '@/lib/api';
import { ApiError, StockLevel, VariantLookup } from '@/lib/api-types';
import { useBranch } from '@/lib/branch-context';
import { colors, radius, spacing, text } from '@/theme';

type ResultState =
  | { status: 'idle' }
  | { status: 'loading'; code: string }
  | { status: 'found'; variant: VariantLookup; stock: StockLevel }
  | { status: 'not-found'; code: string }
  | { status: 'error'; code: string; message: string };

export default function LookupScreen() {
  const { selected } = useBranch();
  const [result, setResult] = useState<ResultState>({ status: 'idle' });
  const [manualCode, setManualCode] = useState('');
  const inFlightRef = useRef(false);

  // Camera dispatches scans only while we're idle. Once a lookup is in
  // flight or a result is on screen, scanning is suspended until the user
  // taps "Scan again" — a deliberate choice between results.
  const scannerActive = result.status === 'idle';

  const runLookup = useCallback(
    async (rawCode: string, by: 'barcode' | 'sku') => {
      const code = rawCode.trim();
      if (!code || inFlightRef.current) return;
      inFlightRef.current = true;
      setResult({ status: 'loading', code });

      try {
        const lookupRes =
          by === 'sku'
            ? await api.lookupVariantBySku(code)
            : await api.lookupVariantByBarcode(code);
        const variant = lookupRes.data;

        // Fetch stock at the selected branch's warehouse (parallel-safe;
        // we already have the variant id).
        const stock = await api.getStockLevel(
          variant.id,
          selected?.warehouseCode,
        );

        setResult({ status: 'found', variant, stock });
      } catch (err) {
        const apiErr = err as Partial<ApiError>;
        if (apiErr?.statusCode === 404) {
          setResult({ status: 'not-found', code });
        } else {
          const msg = Array.isArray(apiErr?.message)
            ? apiErr.message[0] ?? 'Lookup failed'
            : (apiErr?.message as string | undefined) ?? 'Lookup failed';
          setResult({ status: 'error', code, message: msg });
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [selected?.warehouseCode],
  );

  const handleScan = useCallback(
    (data: string) => {
      void runLookup(data, 'barcode');
    },
    [runLookup],
  );

  const handleManualSubmit = useCallback(() => {
    const code = manualCode.trim();
    if (!code) return;
    // Heuristic: pure-digit codes are almost always EAN/UPC barcodes;
    // anything with letters is treated as a SKU. Either path 404s
    // cleanly if wrong, so this is a convenience, not a correctness lever.
    const looksLikeBarcode = /^\d{6,}$/.test(code);
    void runLookup(code, looksLikeBarcode ? 'barcode' : 'sku');
    setManualCode('');
  }, [manualCode, runLookup]);

  const reset = useCallback(() => {
    setResult({ status: 'idle' });
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      {/* Camera area */}
      <View style={styles.cameraArea}>
        <BarcodeScanner
          onScan={handleScan}
          active={scannerActive}
          hint="Point the camera at a product barcode"
        />
      </View>

      {/* Bottom sheet — manual entry + result */}
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Manual entry — always available as a fallback. */}
        <View style={styles.manualRow}>
          <TextInput
            value={manualCode}
            onChangeText={setManualCode}
            placeholder="Enter barcode or SKU"
            placeholderTextColor={colors.ink[300]}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleManualSubmit}
            style={styles.manualInput}
          />
          <Button
            title="Look up"
            size="md"
            onPress={handleManualSubmit}
            disabled={!manualCode.trim()}
            icon={<Ionicons name="search" size={14} color="#fff" />}
          />
        </View>

        {/* Result region */}
        {result.status === 'loading' ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>
              Looking up “{result.code}”…
            </Text>
          </View>
        ) : null}

        {result.status === 'not-found' ? (
          <View style={[styles.statusBox, styles.statusBoxWarn]}>
            <Ionicons
              name="help-circle-outline"
              size={20}
              color={colors.warning}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>Unknown item</Text>
              <Text style={styles.statusBody}>
                No product matches “{result.code}”. Check the label or try
                entering the SKU.
              </Text>
            </View>
            <Pressable onPress={reset} hitSlop={8}>
              <Text style={styles.retryLink}>Scan again</Text>
            </Pressable>
          </View>
        ) : null}

        {result.status === 'error' ? (
          <View style={[styles.statusBox, styles.statusBoxError]}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>Couldn’t look that up</Text>
              <Text style={styles.statusBody}>{result.message}</Text>
            </View>
            <Pressable onPress={reset} hitSlop={8}>
              <Text style={styles.retryLink}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {result.status === 'found' ? (
          <View style={{ gap: spacing[3] }}>
            <VariantCard
              variant={result.variant}
              stock={result.stock}
              priceMode="retail"
              currency="NGN"
            />
            {/* Warehouse context line */}
            <Text style={styles.whLine}>
              Stock shown for {selected?.name} ({result.stock.warehouseCode})
            </Text>
            <Button
              title="Scan another"
              variant="outline"
              size="lg"
              fullWidth
              onPress={reset}
              icon={
                <Ionicons name="scan" size={16} color={colors.ink[900]} />
              }
            />
          </View>
        ) : null}

        {result.status === 'idle' ? (
          <Text style={styles.idleHint}>
            Scan a barcode above, or type a barcode/SKU to look up price and
            stock. This is read-only — nothing is changed.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface[0] },
  cameraArea: {
    flex: 1,
    minHeight: 280,
  },
  sheet: {
    maxHeight: '52%',
    backgroundColor: colors.surface[0],
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    marginTop: -radius['2xl'],
  },
  sheetContent: {
    padding: spacing[4],
    gap: spacing[4],
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
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
  statusBoxWarn: { backgroundColor: colors.warningLight },
  statusBoxError: { backgroundColor: colors.dangerLight },
  statusTitle: {
    ...text.sm,
    fontWeight: '700',
    color: colors.ink[900],
  },
  statusBody: {
    ...text.sm,
    color: colors.ink[600],
    marginTop: 2,
  },
  statusText: { ...text.sm, color: colors.ink[600] },
  retryLink: {
    ...text.sm,
    color: colors.ink[900],
    fontWeight: '700',
  },
  whLine: {
    ...text.xs,
    color: colors.ink[400],
    textAlign: 'center',
  },
  idleHint: {
    ...text.sm,
    color: colors.ink[400],
    lineHeight: 22,
  },
});
