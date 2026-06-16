import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { ApiError } from '@/lib/api-types';
import { useBranch } from '@/lib/branch-context';
import { PendingLine, useBatchScan } from '@/lib/use-batch-scan';
import {
  DEFAULT_RETURN_REASON_ID,
  findReturnReason,
  RETURN_REASONS,
  ReturnReason,
} from '@/lib/return-reasons';
import { colors, radius, spacing, text } from '@/theme';

/**
 * Step 2 of the returns flow: scan the items coming back.
 *
 * Reads orderId/orderNumber/channel from the route params (set by
 * /returns/index). Every scanned line must match a variant on the order
 * — otherwise the line is rejected. On submit:
 *   - STOREFRONT / MOBILE → server creates a Paystack-refund request
 *     (super admin approves; refund hits the original card)
 *   - POS                 → routes through /returns/refund-method so the
 *     cashier picks cash or bank transfer
 *
 * Damage write-offs are unchanged from before: ADJUSTMENT movements that
 * don't generate a refund row (write-off, not customer-paid-back).
 */
export default function ReturnsBatchScreen() {
  const params = useLocalSearchParams<{
    orderId?: string;
    orderNumber?: string;
    channel?: 'STOREFRONT' | 'MOBILE' | 'POS' | 'ADMIN';
    /** Order grand total (minor units), used as the cap on custom refunds. */
    orderTotal?: string;
  }>();
  const { selected } = useBranch();
  const batch = useBatchScan();
  const [submitting, setSubmitting] = useState(false);
  const [reasonPickerFor, setReasonPickerFor] = useState<PendingLine | null>(
    null,
  );

  // variantId → original unitPrice (minor units) from the order. We need
  // this to suggest a refund total on the next screen; trusting variant
  // current retail price would be wrong if the customer paid an older
  // amount or had a discount applied.
  const [orderPriceByVariant, setOrderPriceByVariant] = useState<
    Record<string, number>
  >({});
  useEffect(() => {
    if (!params.orderNumber) return;
    void api
      .lookupOrderForReturn(String(params.orderNumber))
      .then((res) => {
        const map: Record<string, number> = {};
        for (const i of res.data.items) map[i.variantId] = i.unitPrice;
        setOrderPriceByVariant(map);
      })
      .catch(() => { /* user will still be able to scan + submit */ });
  }, [params.orderNumber]);
  const [noteDraft, setNoteDraft] = useState('');

  // Without an order we don't know how to refund — bounce back to step 1.
  useEffect(() => {
    if (!params.orderId) {
      router.replace('/returns' as never);
    }
  }, [params.orderId]);

  const scannerActive = !submitting && !batch.resolving && !reasonPickerFor;

  useEffect(() => {
    for (const line of batch.lines) {
      if (!line.reason) {
        batch.setLineReason(line.clientLineId, DEFAULT_RETURN_REASON_ID);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch.lines]);

  const handleScan = useCallback(
    (code: string) => batch.handleScan(code),
    [batch],
  );

  const openReasonPicker = useCallback((line: PendingLine) => {
    setReasonPickerFor(line);
    setNoteDraft(line.note ?? '');
  }, []);

  const applyReason = useCallback(
    (reason: ReturnReason) => {
      if (!reasonPickerFor) return;
      const note = reason.requiresNote ? noteDraft.trim() || undefined : undefined;
      batch.setLineReason(reasonPickerFor.clientLineId, reason.id, note);
      setReasonPickerFor(null);
      setNoteDraft('');
    },
    [reasonPickerFor, noteDraft, batch],
  );

  const submit = useCallback(async () => {
    if (batch.lines.length === 0 || submitting) return;

    const missingNote = batch.lines.find((l) => {
      const r = findReturnReason(l.reason ?? DEFAULT_RETURN_REASON_ID);
      return r?.requiresNote && !l.note?.trim();
    });
    if (missingNote) {
      Alert.alert(
        'Reason needed',
        `Add a note for "${missingNote.variant.productName}" (reason: Other), or pick a different reason.`,
      );
      return;
    }

    // Split lines: RETURN-kind lines drive the refund flow; ADJUSTMENT
    // lines are damage write-offs and still go through the existing
    // movements-batch endpoint (no refund row).
    const refundLines = batch.lines.filter(
      (l) =>
        findReturnReason(l.reason ?? DEFAULT_RETURN_REASON_ID)?.kind ===
        'RETURN',
    );
    const writeOffLines = batch.lines.filter(
      (l) =>
        findReturnReason(l.reason ?? DEFAULT_RETURN_REASON_ID)?.kind ===
        'ADJUSTMENT',
    );

    if (refundLines.length === 0) {
      // Pure write-off — route through the legacy movements path.
      setSubmitting(true);
      try {
        await api.recordMovementsBatch(
          writeOffLines.map((l) => ({
            clientLineId: l.clientLineId,
            variantId: l.variant.id,
            kind: 'ADJUSTMENT',
            quantity: l.quantity,
            warehouseCode: selected?.warehouseCode,
            referenceType: 'DAMAGE',
            reason: lineReasonText(l),
          })),
        );
        batch.reset();
        Alert.alert(
          'Write-offs recorded',
          `${writeOffLines.length} item${writeOffLines.length === 1 ? '' : 's'} marked as damaged.`,
          [{ text: 'Done', onPress: () => router.replace('/(home)') }],
        );
      } catch (err) {
        const e = err as Partial<ApiError>;
        Alert.alert(
          'Could not record write-offs',
          Array.isArray(e.message)
            ? e.message[0] ?? 'Server error'
            : (e.message as string | undefined) ?? 'Server error',
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Build the refund payload — same per-line shape the server expects.
    const refundPayload = refundLines.map((l) => ({
      clientLineId: l.clientLineId,
      variantId: l.variant.id,
      quantity: l.quantity,
      reasonCode:
        findReturnReason(l.reason ?? DEFAULT_RETURN_REASON_ID)?.id ??
        DEFAULT_RETURN_REASON_ID,
      reasonNote: l.note?.trim() || undefined,
    }));

    // POS-channel → ask "cash or bank transfer?". Storefront / Mobile →
    // server defaults to Paystack-refund on the original payment.
    if (params.channel === 'POS') {
      // Pre-compute the line-total default so the cashier sees the right
      // number on the next screen; they can still override (e.g. include
      // shipping or do a partial refund).
      const linesDefault = refundLines.reduce((sum, l) => {
        const unit = orderPriceByVariant[l.variant.id] ?? 0;
        return sum + unit * l.quantity;
      }, 0);
      router.push({
        pathname: '/returns/refund-method',
        params: {
          orderId: String(params.orderId),
          orderNumber: String(params.orderNumber),
          payload: JSON.stringify(refundPayload),
          defaultAmount: String(linesDefault),
          orderTotal: String(params.orderTotal ?? linesDefault),
        },
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.submitRefundRequest({
        orderId: String(params.orderId),
        lines: refundPayload,
        warehouseCode: selected?.warehouseCode,
      });
      const out = res.data;
      // Any damage write-offs go in their own batch — they bypass refund.
      if (writeOffLines.length > 0) {
        await api.recordMovementsBatch(
          writeOffLines.map((l) => ({
            clientLineId: l.clientLineId,
            variantId: l.variant.id,
            kind: 'ADJUSTMENT',
            quantity: l.quantity,
            warehouseCode: selected?.warehouseCode,
            referenceType: 'DAMAGE',
            reason: lineReasonText(l),
          })),
        );
      }
      batch.reset();
      Alert.alert(
        'Refund request sent',
        `${(out.amount / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })} sent to the super admin for processing.`,
        [{ text: 'Done', onPress: () => router.replace('/(home)') }],
      );
    } catch (err) {
      const e = err as Partial<ApiError>;
      Alert.alert(
        'Could not submit refund',
        Array.isArray(e.message)
          ? e.message[0] ?? 'Server error'
          : (e.message as string | undefined) ?? 'Server error',
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    batch,
    submitting,
    selected?.warehouseCode,
    params.channel,
    params.orderId,
    params.orderNumber,
  ]);

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

  const renderReasonChip = useCallback(
    (line: PendingLine) => {
      const r =
        findReturnReason(line.reason ?? DEFAULT_RETURN_REASON_ID) ??
        RETURN_REASONS[0]!;
      const isWriteOff = r.kind === 'ADJUSTMENT';
      return (
        <Pressable
          onPress={() => openReasonPicker(line)}
          style={({ pressed }) => [
            styles.reasonChip,
            isWriteOff && styles.reasonChipWriteOff,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name={isWriteOff ? 'warning' : 'arrow-undo'}
            size={11}
            color={isWriteOff ? colors.warning : colors.ink[600]}
          />
          <Text
            style={[
              styles.reasonChipText,
              isWriteOff && { color: colors.warning },
            ]}
            numberOfLines={1}
          >
            {r.label}
            {line.note?.trim() ? ` · ${line.note.trim()}` : ''}
          </Text>
          <Ionicons
            name="chevron-down"
            size={11}
            color={isWriteOff ? colors.warning : colors.ink[400]}
          />
        </Pressable>
      );
    },
    [openReasonPicker],
  );

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.cameraArea}>
        <BarcodeScanner
          onScan={handleScan}
          active={scannerActive}
          hint={`Scan each returned item — order #${params.orderNumber ?? ''}`}
        />
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contextRow}>
          <View style={styles.orderChip}>
            <Ionicons name="receipt" size={12} color={colors.ink[700]} />
            <Text style={styles.orderChipText} numberOfLines={1}>
              #{params.orderNumber}
            </Text>
          </View>
          <View style={styles.branchChip}>
            <Ionicons name="business" size={12} color={colors.ink[700]} />
            <Text style={styles.branchChipText} numberOfLines={1}>
              {selected?.name}
            </Text>
          </View>
        </View>
        <Text style={styles.contextHint}>
          Tap a reason chip to change why an item came back. Damage write-offs
          do not generate a refund.
        </Text>

        <BatchPanel
          lines={batch.lines}
          feedback={batch.feedback}
          onIncrement={batch.incrementLine}
          onDecrement={batch.decrementLine}
          onRemove={batch.removeLine}
          renderLineExtra={renderReasonChip}
          emptyHint="Scan a returned item to start."
        />

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

      {/* Reason picker */}
      <Modal
        visible={!!reasonPickerFor}
        transparent
        animationType="slide"
        onRequestClose={() => setReasonPickerFor(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Why did it come back?</Text>
              <Pressable
                onPress={() => setReasonPickerFor(null)}
                hitSlop={8}
              >
                <Ionicons name="close" size={20} color={colors.ink[500]} />
              </Pressable>
            </View>
            {reasonPickerFor ? (
              <Text style={styles.modalSubtitle} numberOfLines={2}>
                {reasonPickerFor.variant.productName}
                {reasonPickerFor.variant.variantName
                  ? ` · ${reasonPickerFor.variant.variantName}`
                  : ''}
              </Text>
            ) : null}

            <View style={styles.reasonList}>
              {RETURN_REASONS.map((r) => {
                const isCurrent =
                  (reasonPickerFor?.reason ?? DEFAULT_RETURN_REASON_ID) ===
                  r.id;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => {
                      if (r.requiresNote) {
                        if (reasonPickerFor) {
                          batch.setLineReason(
                            reasonPickerFor.clientLineId,
                            r.id,
                            noteDraft.trim() || undefined,
                          );
                          setReasonPickerFor({
                            ...reasonPickerFor,
                            reason: r.id,
                          });
                        }
                      } else {
                        applyReason(r);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.reasonRow,
                      isCurrent && styles.reasonRowActive,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <View style={styles.reasonRowBody}>
                      <Text style={styles.reasonRowLabel}>{r.label}</Text>
                      <Text style={styles.reasonRowDesc}>{r.description}</Text>
                    </View>
                    {isCurrent ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={colors.ink[900]}
                      />
                    ) : (
                      <Ionicons
                        name="ellipse-outline"
                        size={18}
                        color={colors.ink[200]}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {findReturnReason(
              reasonPickerFor?.reason ?? DEFAULT_RETURN_REASON_ID,
            )?.requiresNote ? (
              <View style={{ gap: spacing[2] }}>
                <TextInput
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="Describe the reason…"
                  placeholderTextColor={colors.ink[300]}
                  style={styles.noteInput}
                  multiline
                />
                <Button
                  title="Save reason"
                  size="md"
                  fullWidth
                  disabled={!noteDraft.trim()}
                  onPress={() => {
                    const other = findReturnReason('OTHER')!;
                    applyReason(other);
                  }}
                />
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={submitting} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <Text style={styles.overlayText}>Submitting return…</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function lineReasonText(l: PendingLine): string {
  const r =
    findReturnReason(l.reason ?? DEFAULT_RETURN_REASON_ID) ??
    RETURN_REASONS[0]!;
  return l.note?.trim()
    ? `${r.label} — ${l.note.trim()} (scanner)`
    : `${r.label} (scanner)`;
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
  sheetContent: { padding: spacing[4], gap: spacing[3] },
  contextRow: { flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' },
  orderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    backgroundColor: colors.surface[1],
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  orderChipText: { ...text.xs, color: colors.ink[700], fontWeight: '700' },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    backgroundColor: colors.surface[1],
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  branchChipText: { ...text.xs, color: colors.ink[700], fontWeight: '600' },
  contextHint: { ...text.xs, color: colors.ink[400] },

  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.surface[2],
    borderRadius: radius.full,
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    maxWidth: '100%',
  },
  reasonChipWriteOff: {
    backgroundColor: colors.warningLight,
  },
  reasonChipText: {
    ...text.xs,
    color: colors.ink[600],
    fontWeight: '600',
    flexShrink: 1,
  },

  actions: { gap: spacing[2], marginTop: spacing[2] },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface[0],
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    padding: spacing[5],
    gap: spacing[4],
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { ...text.lg, fontWeight: '700', color: colors.ink[900] },
  modalSubtitle: { ...text.sm, color: colors.ink[500] },
  reasonList: { gap: spacing[2] },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  reasonRowActive: {
    borderColor: colors.ink[900],
    backgroundColor: colors.surface[1],
  },
  reasonRowBody: { flex: 1 },
  reasonRowLabel: { ...text.base, fontWeight: '700', color: colors.ink[900] },
  reasonRowDesc: { ...text.xs, color: colors.ink[500], marginTop: 2 },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: 12,
    backgroundColor: colors.surface[1],
    color: colors.ink[900],
    minHeight: 64,
    textAlignVertical: 'top',
    ...text.base,
  },

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
