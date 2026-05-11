import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { VariantLookup, StockLevel } from '@/lib/api-types';
import { formatMinor, formatOptions } from '@/lib/format';
import { colors, radius, spacing, text } from '@/theme';

interface Props {
  variant: VariantLookup;
  /** Optional stock — show a stock badge when provided. */
  stock?: StockLevel | null;
  /** Which price to surface: retail (storefront) or wholesale (POS). */
  priceMode?: 'retail' | 'wholesale';
  /** Currency for the displayed price. */
  currency?: 'NGN' | 'USD';
  style?: ViewStyle;
}

function stockTone(available: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (available <= 0) {
    return { label: 'Out of stock', color: colors.danger, bg: colors.dangerLight };
  }
  if (available < 10) {
    return { label: `${available} left`, color: colors.warning, bg: colors.warningLight };
  }
  return { label: `${available} in stock`, color: colors.success, bg: colors.successLight };
}

export function VariantCard({
  variant,
  stock,
  priceMode = 'retail',
  currency = 'NGN',
  style,
}: Props) {
  const priceStr =
    priceMode === 'wholesale'
      ? currency === 'USD'
        ? variant.price.wholesaleUsd
        : variant.price.wholesaleNgn
      : currency === 'USD'
        ? variant.price.retailUsd
        : variant.price.retailNgn;

  const optionsStr = formatOptions(variant.options);
  const stockBadge = stock ? stockTone(stock.available) : null;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.imageWrap}>
        {variant.imageUrl ? (
          <Image
            source={{ uri: variant.imageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={28} color={colors.ink[300]} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.productName} numberOfLines={2}>
          {variant.productName}
        </Text>
        {variant.variantName || optionsStr ? (
          <Text style={styles.variantName} numberOfLines={1}>
            {variant.variantName ?? ''}
            {variant.variantName && optionsStr ? ' · ' : ''}
            {optionsStr}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          <Text style={styles.sku} numberOfLines={1}>
            SKU {variant.sku}
          </Text>
          {variant.barcode ? (
            <Text style={styles.barcode} numberOfLines={1}>
              · {variant.barcode}
            </Text>
          ) : null}
        </View>

        <View style={styles.bottomRow}>
          <Text style={styles.price}>{formatMinor(priceStr, currency)}</Text>
          {stockBadge ? (
            <View
              style={[styles.stockBadge, { backgroundColor: stockBadge.bg }]}
            >
              <Text style={[styles.stockText, { color: stockBadge.color }]}>
                {stockBadge.label}
              </Text>
            </View>
          ) : null}
        </View>

        {!variant.isActive ? (
          <View style={styles.inactiveBadge}>
            <Ionicons name="warning-outline" size={12} color={colors.warning} />
            <Text style={styles.inactiveText}>Variant is inactive</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing[3],
    backgroundColor: colors.surface[0],
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.xl,
    padding: spacing[3],
  },
  imageWrap: {
    width: 84,
    height: 84,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface[2],
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, justifyContent: 'center' },
  productName: {
    ...text.base,
    fontWeight: '700',
    color: colors.ink[900],
  },
  variantName: {
    ...text.sm,
    color: colors.ink[500],
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[2],
  },
  sku: {
    ...text.xs,
    color: colors.ink[400],
    fontWeight: '600',
  },
  barcode: {
    ...text.xs,
    color: colors.ink[400],
    marginLeft: 4,
    flexShrink: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[2],
  },
  price: {
    ...text.base,
    fontWeight: '700',
    color: colors.ink[900],
  },
  stockBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  stockText: { ...text.xs, fontWeight: '700' },
  inactiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing[2],
  },
  inactiveText: { ...text.xs, color: colors.warning, fontWeight: '600' },
});
