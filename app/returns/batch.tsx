import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
import { ApiError, MovementBatchLine } from '@/lib/api-types';
import { useBranch } from '@/lib/branch-context';
import { PendingLine, useBatchScan } from '@/lib/use-batch-scan';
import {
  DEFAULT_RETURN_REASON_ID,
  findReturnReason,
  RETURN_REASONS,
  ReturnReason,
} from '@/lib/return-reasons';
import { colors, radius, spacing, text } from '@/theme';

export default function ReturnsBatchScreen() {
  const { selected } = useBranch();
  const batch = useBatchScan();
  const [submitting, setSubmitting] = useState(false);
  // The line currently having its reason edited (or null when the picker
  // is closed).
  const [reasonPickerFor, setReasonPickerFor] = useState<PendingLine | null>(
    null,
  );
  const [noteDraft, setNoteDraft] = useState('');

  const scannerActive = !submitting && !batch.resolving && !reasonPickerFor;

  // Ensure every freshly scanned line carries a default reason. useBatchScan
  // adds lines with no reason; the returns flow needs one on every line.
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

    // Validation: any "Other" line must have a note.
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

    setSubmitting(true);
    const lines: MovementBatchLine[] = batch.lines.map((l) => {
      const r =
        findReturnReason(l.reason ?? DEFAULT_RETURN_REASON_ID) ??
        RETURN_REASONS[0]!;
      const reasonText = l.note?.trim()
        ? `${r.label} — ${l.note.trim()}`
        : r.label;
      return {
        clientLineId: l.clientLineId,
        variantId: l.variant.id,
        kind: r.kind, // RETURN (back to stock) or ADJUSTMENT (write-off)
        quantity: l.quantity,
        warehouseCode: selected?.warehouseCode,
        referenceType: r.kind === 'ADJUSTMENT' ? 'DAMAGE' : 'CUSTOMER_RETURN',
        reason: `${reasonText} (scanner)`,
      };
    });

    try {
      const res = await api.recordMovementsBatch(lines);
      const { accepted, deduplicated } = res.data;
      const totalUnits = batch.lines.reduce((s, l) => s + l.quantity, 0);
      const writeOffs = batch.lines.filter(
        (l) =>
          findReturnReason(l.reason ?? DEFAULT_RETURN_REASON_ID)?.kind ===
          'ADJUSTMENT',
      ).length;
      batch.reset();
      Alert.alert(
        'Returns recorded',
        [
          `${accepted} line${accepted === 1 ? '' : 's'} recorded (${totalUnits} units).`,
          writeOffs > 0
            ? `${writeOffs} marked as damaged write-off${writeOffs === 1 ? '' : 's'}.`
            : null,
          deduplicated > 0
            ? `${deduplicated} duplicate line${deduplicated === 1 ? '' : 's'} skipped.`
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
        [
          { text: 'Scan more', style: 'default' },
          { text: 'Done', style: 'cancel', onPress: () => router.back() },
        ],
      );
    } catch (err) {
      const apiErr = err as Partial<ApiError>;
      const msg = Array.isArray(apiErr?.message)
        ? apiErr.message[0] ?? 'Failed to record returns'
        : (apiErr?.message as string | undefined) ??
          'Failed to record returns';
      // A 409 here means a damage write-off would drive a variant below
      // zero — the WHOLE batch was rejected. Tell the user plainly.
      const is409 = apiErr?.statusCode === 409;
      Alert.alert(
        is409 ? 'Batch rejected' : 'Could not record returns',
        is409
          ? `${msg}\n\nNothing was recorded. Reduce the affected quantity or remove that line, then try again.`
          : msg,
      );
    } finally {
      setSubmitting(false);
    }
  }, [batch, submitting, selected?.warehouseCode]);

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
          accessibilityRole="button"
          accessibilityLabel={`Change reason for ${line.variant.productName} (current: ${r.label})`}
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
          hint="Scan each returned or damaged item"
        />
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contextRow}>
          <View style={styles.branchChip}>
            <Ionicons name="business" size={12} color={colors.ink[700]} />
            <Text style={styles.branchChipText} numberOfLines={1}>
              {selected?.name}
            </Text>
          </View>
          <Text style={styles.contextHint}>
            Tap a reason chip to change why an item came back.
          </Text>
        </View>

        <BatchPanel
          lines={batch.lines}
          feedback={batch.feedback}
          onIncrement={batch.incrementLine}
          onDecrement={batch.decrementLine}
          onRemove={batch.removeLine}
          renderLineExtra={renderReasonChip}
          emptyHint="Scan a returned or damaged item to start."
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

      {/* Reason picker modal */}
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
                        // Keep the picker open so the note field shows.
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

            {/* Note field — only relevant when the chosen reason is "Other". */}
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
            <Text style={styles.overlayText}>Recording returns…</Text>
          </View>
        </View>
      </Modal>
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
  contextRow: { gap: spacing[2] },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    backgroundColor: colors.surface[1],
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    alignSelf: 'flex-start',
  },
  branchChipText: { ...text.xs, color: colors.ink[700], fontWeight: '600' },
  contextHint: { ...text.xs, color: colors.ink[400] },

  // Reason chip rendered under each batch line.
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

  // Reason picker modal
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
