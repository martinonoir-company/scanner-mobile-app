import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-types';
import { useBranch } from '@/lib/branch-context';
import { formatMinor } from '@/lib/format';
import { colors, radius, spacing, text } from '@/theme';

/**
 * Step 3 for POS returns: how is the customer being paid back?
 *
 *  - CASH       → refund out of the till, no super-admin step
 *  - TRANSFER   → capture + verify bank details at the till, then queue
 *                 a Paystack-transfer refund request for the super admin
 *
 * The cashier can override the refund amount (partial refund, or to
 * deduct shipping). When the previous screen skipped item scanning,
 * a default of zero forces the cashier to type the amount explicitly.
 */

interface BatchLineParam {
  clientLineId: string;
  variantId: string;
  quantity: number;
  orderItemId?: string;
  reasonCode?: string;
  reasonNote?: string;
}

export default function RefundMethodScreen() {
  const params = useLocalSearchParams<{
    orderId: string;
    orderNumber: string;
    payload: string;
    /** Pre-computed refund total in minor units (from line items). */
    defaultAmount?: string;
    /** Order grand total in minor units — cap on the refund amount. */
    orderTotal?: string;
    /** "1" when the user picked Skip Items on the previous screen. */
    skippedScan?: string;
    reason?: string;
  }>();
  const { selected } = useBranch();

  const [method, setMethod] = useState<'CASH' | 'TRANSFER' | null>(null);

  // Bank picker (modal with search).
  const [banks, setBanks] = useState<Array<{ name: string; code: string }>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bankFilter, setBankFilter] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');

  const [accountNumber, setAccountNumber] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Custom-amount entry. We always present this so the cashier can adjust
  // for shipping etc. The default is the sum of returned-line totals.
  const defaultAmount = useMemo(() => {
    const n = Number(params.defaultAmount ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [params.defaultAmount]);
  const orderTotal = useMemo(() => {
    const n = Number(params.orderTotal ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [params.orderTotal]);
  const skippedScan = params.skippedScan === '1';

  // The cashier types whole naira; we store as minor units (kobo).
  const [amountInput, setAmountInput] = useState<string>(
    defaultAmount > 0 ? String(defaultAmount / 100) : '',
  );

  const amountMinor = useMemo(() => {
    const n = parseFloat(amountInput.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }, [amountInput]);

  const [submitting, setSubmitting] = useState(false);

  const lines: BatchLineParam[] = useMemo(() => {
    try {
      return JSON.parse(String(params.payload ?? '[]')) as BatchLineParam[];
    } catch {
      return [];
    }
  }, [params.payload]);

  // Dedupe banks by code — Paystack returns multiple entries for some
  // banks (commercial + USSD + digital) sharing a code. That triggered
  // React's duplicate-key warning and rendered the screen unusable.
  useEffect(() => {
    void api.listBanks().then((res) => {
      const seen = new Set<string>();
      const unique = res.data
        .filter((b) => {
          if (!b.code || seen.has(b.code)) return false;
          seen.add(b.code);
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      setBanks(unique);
    });
  }, []);

  const filteredBanks = useMemo(() => {
    const q = bankFilter.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter(
      (b) =>
        b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q),
    );
  }, [banks, bankFilter]);

  const canVerify =
    !!bankCode && accountNumber.replace(/\D/g, '').length >= 10;

  const verifyAccount = useCallback(async () => {
    if (!canVerify) return;
    setVerifying(true);
    setVerifyError(null);
    setVerifiedName(null);
    try {
      const res = await api.verifyBankAccount({
        accountNumber: accountNumber.trim(),
        bankCode,
      });
      if (res.data.ok) {
        setVerifiedName(res.data.accountName);
      } else {
        setVerifyError(res.data.error);
      }
    } catch (err) {
      const e = err as Partial<ApiError>;
      setVerifyError(
        Array.isArray(e.message)
          ? e.message[0] ?? 'Could not verify account'
          : (e.message as string | undefined) ?? 'Could not verify account',
      );
    } finally {
      setVerifying(false);
    }
  }, [canVerify, accountNumber, bankCode]);

  const amountValid =
    amountMinor > 0 && (orderTotal === 0 || amountMinor <= orderTotal);

  const submit = useCallback(async () => {
    if (!method || submitting) return;
    if (!amountValid) {
      Alert.alert(
        'Check the amount',
        orderTotal > 0 && amountMinor > orderTotal
          ? `Refund cannot exceed ${formatMinor(orderTotal)} — the order total.`
          : 'Enter the amount to refund.',
      );
      return;
    }
    if (method === 'TRANSFER' && !verifiedName) {
      Alert.alert(
        'Verify account first',
        'Tap "Verify account" and confirm the name with the customer before submitting.',
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.submitRefundRequest({
        orderId: String(params.orderId),
        lines,
        warehouseCode: selected?.warehouseCode,
        reason: params.reason ? String(params.reason) : undefined,
        posCashRefund: method === 'CASH',
        // Always send a customAmount — server treats it as the
        // authoritative figure when present.
        customAmount: amountMinor,
        bankDetails:
          method === 'TRANSFER' && verifiedName
            ? { bankCode, accountNumber: accountNumber.trim(), accountName: verifiedName }
            : undefined,
      });
      const out = res.data;
      Alert.alert(
        method === 'CASH' ? 'Cash refund recorded' : 'Refund request sent',
        method === 'CASH'
          ? `Pay the customer ${formatMinor(out.amount)} from the till.`
          : `The super admin will process ${formatMinor(out.amount)} to ${verifiedName}.`,
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
    method,
    submitting,
    amountValid,
    amountMinor,
    orderTotal,
    verifiedName,
    params.orderId,
    params.reason,
    lines,
    selected?.warehouseCode,
    bankCode,
    accountNumber,
  ]);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>How is the customer being paid back?</Text>
        <Text style={styles.subtitle}>
          Order #{params.orderNumber}
          {skippedScan ? ' · items not scanned' : ''}
        </Text>

        {/* Amount field */}
        <View style={styles.amountBlock}>
          <Text style={styles.fieldLabel}>Refund amount (₦)</Text>
          <TextInput
            value={amountInput}
            onChangeText={setAmountInput}
            placeholder={
              defaultAmount > 0
                ? String(defaultAmount / 100)
                : 'e.g. 12000'
            }
            placeholderTextColor={colors.ink[300]}
            keyboardType="decimal-pad"
            style={styles.amountInput}
          />
          <Text style={styles.fieldHint}>
            {defaultAmount > 0 && amountMinor !== defaultAmount
              ? `Default was ${formatMinor(defaultAmount)} — adjust if shipping should be excluded or only a partial refund applies.`
              : orderTotal > 0
                ? `Cannot exceed ${formatMinor(orderTotal)} (order total).`
                : 'Enter the amount to refund the customer.'}
          </Text>
        </View>

        {/* Method options */}
        <Pressable
          onPress={() => setMethod('CASH')}
          style={[styles.option, method === 'CASH' && styles.optionActive]}
        >
          <Ionicons name="cash" size={20} color={colors.ink[900]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.optionLabel}>Cash from the till</Text>
            <Text style={styles.optionDesc}>
              Pay back now from the cash drawer. No super-admin step.
            </Text>
          </View>
          {method === 'CASH' && (
            <Ionicons name="checkmark-circle" size={18} color={colors.ink[900]} />
          )}
        </Pressable>

        <Pressable
          onPress={() => setMethod('TRANSFER')}
          style={[styles.option, method === 'TRANSFER' && styles.optionActive]}
        >
          <Ionicons name="card" size={20} color={colors.ink[900]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.optionLabel}>Bank transfer (Paystack)</Text>
            <Text style={styles.optionDesc}>
              Collect bank details, verify the account, super admin will release.
            </Text>
          </View>
          {method === 'TRANSFER' && (
            <Ionicons name="checkmark-circle" size={18} color={colors.ink[900]} />
          )}
        </Pressable>

        {method === 'TRANSFER' && (
          <View style={styles.transferForm}>
            <Text style={styles.fieldLabel}>Bank</Text>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={styles.bankPicker}
            >
              <Text
                style={[
                  styles.bankPickerText,
                  !bankName && styles.bankPickerPlaceholder,
                ]}
                numberOfLines={1}
              >
                {bankName || 'Tap to pick the customer’s bank'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.ink[400]} />
            </Pressable>

            <Text style={styles.fieldLabel}>Account number</Text>
            <TextInput
              value={accountNumber}
              onChangeText={(t) => {
                setAccountNumber(t);
                setVerifiedName(null);
                setVerifyError(null);
              }}
              placeholder="10-digit account number"
              placeholderTextColor={colors.ink[300]}
              keyboardType="number-pad"
              maxLength={10}
              style={styles.input}
            />

            <Button
              title={verifyingButtonLabel(verifying, verifiedName)}
              variant={verifiedName ? 'ghost' : 'secondary'}
              onPress={verifyAccount}
              disabled={!canVerify || verifying}
              loading={verifying}
            />

            {verifyError && (
              <View style={styles.errorBox}>
                <Ionicons name="warning" size={14} color={colors.warning} />
                <Text style={styles.errorText}>{verifyError}</Text>
              </View>
            )}

            {verifiedName && (
              <View style={styles.verifiedBox}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={styles.verifiedText}>
                  {verifiedName} — confirm with the customer before submitting.
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.actions}>
          <Button
            title={
              !method
                ? 'Pick a method'
                : !amountValid
                  ? 'Enter a valid amount'
                  : method === 'CASH'
                    ? `Record ${formatMinor(amountMinor)} cash refund`
                    : `Send ${formatMinor(amountMinor)} to super admin`
            }
            size="lg"
            fullWidth
            disabled={
              !method ||
              !amountValid ||
              submitting ||
              (method === 'TRANSFER' && !verifiedName)
            }
            loading={submitting}
            onPress={submit}
          />
          <Button
            title="Back"
            variant="ghost"
            size="md"
            fullWidth
            onPress={() => router.back()}
          />
        </View>
      </ScrollView>

      {/* Bank picker modal */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pick a bank</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.ink[500]} />
              </Pressable>
            </View>
            <TextInput
              value={bankFilter}
              onChangeText={setBankFilter}
              placeholder="Search…"
              placeholderTextColor={colors.ink[300]}
              autoCorrect={false}
              autoCapitalize="none"
              style={styles.searchInput}
            />
            <FlatList
              data={filteredBanks}
              keyExtractor={(b) => b.code}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => {
                const active = item.code === bankCode;
                return (
                  <Pressable
                    onPress={() => {
                      setBankCode(item.code);
                      setBankName(item.name);
                      setVerifiedName(null);
                      setVerifyError(null);
                      setPickerOpen(false);
                      setBankFilter('');
                    }}
                    style={[styles.bankRow, active && styles.bankRowActive]}
                  >
                    <Text style={styles.bankRowText} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.bankRowCode}>{item.code}</Text>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No banks match “{bankFilter}”.</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function verifyingButtonLabel(verifying: boolean, name: string | null): string {
  if (verifying) return 'Verifying…';
  if (name) return 'Verified ✓';
  return 'Verify account';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface[0] },
  content: { padding: spacing[4], gap: spacing[3] },
  title: { ...text.lg, fontWeight: '700', color: colors.ink[900] },
  subtitle: { ...text.sm, color: colors.ink[500] },

  amountBlock: { gap: spacing[1] },
  amountInput: {
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: 14,
    backgroundColor: colors.surface[1],
    color: colors.ink[900],
    fontSize: 20,
    fontWeight: '700',
  },
  fieldHint: { ...text.xs, color: colors.ink[500] },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.lg,
    backgroundColor: colors.surface[0],
  },
  optionActive: {
    borderColor: colors.ink[900],
    backgroundColor: colors.surface[1],
  },
  optionLabel: { ...text.base, fontWeight: '700', color: colors.ink[900] },
  optionDesc: { ...text.xs, color: colors.ink[500], marginTop: 2 },

  transferForm: { gap: spacing[2] },
  fieldLabel: { ...text.xs, color: colors.ink[500], fontWeight: '600' },

  bankPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: 12,
    backgroundColor: colors.surface[1],
  },
  bankPickerText: { ...text.base, color: colors.ink[900], flex: 1 },
  bankPickerPlaceholder: { color: colors.ink[400] },

  input: {
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
  verifiedBox: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.successLight ?? '#e6f7ee',
  },
  verifiedText: { ...text.sm, color: colors.ink[800], flexShrink: 1 },

  actions: { gap: spacing[2], marginTop: spacing[3] },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface[0],
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    padding: spacing[4],
    gap: spacing[3],
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { ...text.lg, fontWeight: '700', color: colors.ink[900] },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: 10,
    backgroundColor: colors.surface[1],
    color: colors.ink[900],
    ...text.base,
  },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink[100],
    gap: spacing[2],
  },
  bankRowActive: { backgroundColor: colors.surface[1] },
  bankRowText: { ...text.base, color: colors.ink[900], flex: 1 },
  bankRowCode: { ...text.xs, color: colors.ink[400], fontVariant: ['tabular-nums'] },
  emptyText: { ...text.sm, color: colors.ink[500], textAlign: 'center', paddingVertical: spacing[4] },
});
