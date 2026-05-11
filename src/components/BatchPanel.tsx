import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PendingLine, ScanFeedback } from '@/lib/use-batch-scan';
import { formatOptions } from '@/lib/format';
import { QtyStepper } from '@/components/QtyStepper';
import { colors, radius, spacing, text } from '@/theme';

interface Props {
  lines: PendingLine[];
  feedback: ScanFeedback;
  onIncrement: (clientLineId: string) => void;
  onDecrement: (clientLineId: string) => void;
  onRemove: (clientLineId: string) => void;
  /**
   * Optional per-line trailing slot (e.g. the returns flow renders a
   * reason chip here). Receives the line; return null to render nothing.
   */
  renderLineExtra?: (line: PendingLine) => React.ReactNode;
  /** Optional empty-state hint shown when there are no lines yet. */
  emptyHint?: string;
}

function FeedbackBanner({ feedback }: { feedback: ScanFeedback }) {
  if (!feedback) return null;

  let tone: { bg: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] };
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
    <View style={[styles.feedback, { backgroundColor: tone.bg }]}>
      <Ionicons name={tone.icon} size={16} color={tone.color} />
      <Text style={[styles.feedbackText, { color: tone.color }]} numberOfLines={2}>
        {textStr}
      </Text>
    </View>
  );
}

export function BatchPanel({
  lines,
  feedback,
  onIncrement,
  onDecrement,
  onRemove,
  renderLineExtra,
  emptyHint,
}: Props) {
  return (
    <View style={styles.container}>
      <FeedbackBanner feedback={feedback} />

      {lines.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="scan-outline" size={28} color={colors.ink[300]} />
          <Text style={styles.emptyText}>
            {emptyHint ?? 'Scan items to add them here.'}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {lines.map((line) => {
            const optionsStr = formatOptions(line.variant.options);
            return (
              <View key={line.clientLineId} style={styles.row}>
                <View style={styles.thumb}>
                  {line.variant.imageUrl ? (
                    <Image
                      source={{ uri: line.variant.imageUrl }}
                      style={styles.thumbImg}
                      contentFit="cover"
                      transition={100}
                    />
                  ) : (
                    <Ionicons
                      name="cube-outline"
                      size={20}
                      color={colors.ink[300]}
                    />
                  )}
                </View>

                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={1}>
                    {line.variant.productName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {line.variant.variantName ?? ''}
                    {line.variant.variantName && optionsStr ? ' · ' : ''}
                    {optionsStr || `SKU ${line.variant.sku}`}
                  </Text>
                  {renderLineExtra ? (
                    <View style={styles.extra}>{renderLineExtra(line)}</View>
                  ) : null}
                </View>

                <QtyStepper
                  value={line.quantity}
                  onIncrement={() => onIncrement(line.clientLineId)}
                  onDecrement={() => onDecrement(line.clientLineId)}
                />

                <Pressable
                  onPress={() => onRemove(line.clientLineId)}
                  hitSlop={8}
                  style={styles.removeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${line.variant.productName}`}
                >
                  <Ionicons name="close" size={16} color={colors.ink[400]} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing[3] },
  feedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.lg,
  },
  feedbackText: { ...text.sm, fontWeight: '600', flex: 1 },
  empty: {
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[8],
  },
  emptyText: { ...text.sm, color: colors.ink[400], textAlign: 'center' },
  list: { gap: spacing[2] },
  row: {
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
  body: { flex: 1 },
  name: { ...text.sm, fontWeight: '700', color: colors.ink[900] },
  meta: { ...text.xs, color: colors.ink[500], marginTop: 2 },
  extra: { marginTop: spacing[2] },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
