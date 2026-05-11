import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { BatchPanel } from '@/components/BatchPanel';
import { Button } from '@/components/Button';
import { api } from '@/lib/api';
import { ApiError, MovementBatchLine } from '@/lib/api-types';
import { useBranch } from '@/lib/branch-context';
import { useBatchScan } from '@/lib/use-batch-scan';
import { colors, radius, spacing, text } from '@/theme';

export default function RestockBatchScreen() {
  const { selected } = useBranch();
  const batch = useBatchScan();
  const [supplierRef, setSupplierRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Camera dispatches scans only while we're actively scanning. We pause
  // it during submission so a late scan can't slip into a batch that's
  // already being committed.
  const scannerActive = !submitting && !batch.resolving;

  const handleScan = useCallback(
    (code: string) => batch.handleScan(code),
    [batch],
  );

  const submit = useCallback(async () => {
    if (batch.lines.length === 0 || submitting) return;
    setSubmitting(true);

    const ref = supplierRef.trim();
    const lines: MovementBatchLine[] = batch.lines.map((l) => ({
      clientLineId: l.clientLineId,
      variantId: l.variant.id,
      kind: 'RECEIPT',
      quantity: l.quantity,
      warehouseCode: selected?.warehouseCode,
      referenceId: ref || undefined,
      referenceType: ref ? 'SUPPLIER_DELIVERY' : undefined,
      reason: ref ? `Supplier delivery ${ref}` : 'Stock receipt (scanner)',
    }));

    try {
      const res = await api.recordMovementsBatch(lines);
      const { accepted, deduplicated } = res.data;
      const totalUnits = batch.lines.reduce((s, l) => s + l.quantity, 0);
      batch.reset();
      setSupplierRef('');
      Alert.alert(
        'Stock received',
        deduplicated > 0
          ? `${accepted} line${accepted === 1 ? '' : 's'} recorded (${totalUnits} units). ${deduplicated} duplicate line${deduplicated === 1 ? '' : 's'} were skipped.`
          : `${accepted} line${accepted === 1 ? '' : 's'} recorded (${totalUnits} units).`,
        [
          { text: 'Scan more', style: 'default' },
          {
            text: 'Done',
            style: 'cancel',
            onPress: () => router.back(),
          },
        ],
      );
    } catch (err) {
      const apiErr = err as Partial<ApiError>;
      const msg = Array.isArray(apiErr?.message)
        ? apiErr.message[0] ?? 'Failed to record stock'
        : (apiErr?.message as string | undefined) ?? 'Failed to record stock';
      Alert.alert('Could not record stock', msg);
    } finally {
      setSubmitting(false);
    }
  }, [batch, submitting, supplierRef, selected?.warehouseCode]);

  const confirmDiscardAndBack = useCallback(() => {
    if (batch.lines.length === 0) {
      router.back();
      return;
    }
    Alert.alert(
      'Discard this batch?',
      `${batch.lines.length} scanned line${batch.lines.length === 1 ? '' : 's'} will be lost.`,
      [
        { text: 'Keep scanning', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            batch.reset();
            router.back();
          },
        },
      ],
    );
  }, [batch]);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      {/* Camera */}
      <View style={styles.cameraArea}>
        <BarcodeScanner
          onScan={handleScan}
          active={scannerActive}
          hint="Scan each item in the delivery"
        />
      </View>

      {/* Sheet */}
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Branch + supplier ref */}
        <View style={styles.contextRow}>
          <View style={styles.branchChip}>
            <Ionicons name="business" size={12} color={colors.ink[700]} />
            <Text style={styles.branchChipText} numberOfLines={1}>
              {selected?.name}
            </Text>
          </View>
        </View>
        <TextInput
          value={supplierRef}
          onChangeText={setSupplierRef}
          placeholder="Supplier reference (optional)"
          placeholderTextColor={colors.ink[300]}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.refInput}
        />

        <BatchPanel
          lines={batch.lines}
          feedback={batch.feedback}
          onIncrement={batch.incrementLine}
          onDecrement={batch.decrementLine}
          onRemove={batch.removeLine}
          emptyHint="Point the camera at a delivery item to start."
        />

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title={
              batch.totalQuantity > 0
                ? `Submit ${batch.totalQuantity} unit${batch.totalQuantity === 1 ? '' : 's'}`
                : 'Submit'
            }
            size="lg"
            fullWidth
            loading={submitting}
            disabled={batch.lines.length === 0}
            onPress={submit}
            icon={<Ionicons name="checkmark" size={16} color="#fff" />}
          />
          <Button
            title="Cancel"
            variant="ghost"
            size="md"
            fullWidth
            onPress={confirmDiscardAndBack}
          />
        </View>
      </ScrollView>

      {/* Submitting overlay — blocks interaction while the batch posts. */}
      <Modal visible={submitting} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <Text style={styles.overlayText}>Recording stock…</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface[0] },
  cameraArea: { flex: 1, minHeight: 240 },
  sheet: {
    maxHeight: '58%',
    backgroundColor: colors.surface[0],
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    marginTop: -radius['2xl'],
  },
  sheetContent: {
    padding: spacing[4],
    gap: spacing[4],
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    backgroundColor: colors.surface[1],
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  branchChipText: {
    ...text.xs,
    color: colors.ink[700],
    fontWeight: '600',
  },
  refInput: {
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
  actions: { gap: spacing[2], marginTop: spacing[2] },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    backgroundColor: colors.surface[0],
    borderRadius: radius.xl,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[5],
  },
  overlayText: { ...text.base, color: colors.ink[900], fontWeight: '600' },
});
