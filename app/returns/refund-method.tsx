import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { Button } from '@/components/Button';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-types';
import { useBranch } from '@/lib/branch-context';
import { colors, radius, spacing, text } from '@/theme';

/**
 * Step 3 for POS-channel returns: how is the customer being paid back?
 *
 *  - CASH       → refund out of the till, no super-admin step
 *  - TRANSFER   → capture + verify bank details at the till, then queue
 *                 a Paystack-transfer refund request for the super admin
 *
 * For storefront / mobile orders this screen is skipped entirely — the
 * Paystack-refund path runs straight from the batch screen.
 *
 * The serialised batch is passed via search params so this screen is
 * stateless; on success the parent stack pops to home.
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
    reason?: string;
  }>();
  const { selected } = useBranch();

  const [method, setMethod] = useState<'CASH' | 'TRANSFER' | null>(null);
  const [banks, setBanks] = useState<Array<{ name: string; code: string }>>([]);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const lines: BatchLineParam[] = (() => {
    try {
      return JSON.parse(String(params.payload ?? '[]')) as BatchLineParam[];
    } catch {
      return [];
    }
  })();

  useEffect(() => {
    void api.listBanks().then((res) => setBanks(res.data));
  }, []);

  // Account verification — only enable Submit once the account name comes
  // back from Paystack and matches what the cashier expects. Bank code +
  // a 10-digit account number is the minimum input.
  const canVerify =
    bankCode.length > 0 && accountNumber.replace(/\D/g, '').length >= 10;

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

  const submit = useCallback(async () => {
    if (!method || submitting) return;
    if (method === 'TRANSFER' && !verifiedName) {
      Alert.alert(
        'Verify account first',
        'Tap "Verify account" and confirm the account name with the customer before submitting.',
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
        bankDetails:
          method === 'TRANSFER' && verifiedName
            ? {
                bankCode,
                accountNumber: accountNumber.trim(),
                accountName: verifiedName,
              }
            : undefined,
      });
      const out = res.data;
      Alert.alert(
        method === 'CASH' ? 'Cash refund recorded' : 'Refund request sent',
        method === 'CASH'
          ? `Pay the customer ₦${(out.amount / 100).toLocaleString()} from the till.`
          : `The super admin will process ₦${(out.amount / 100).toLocaleString()} to ${verifiedName}.`,
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>How is the customer being paid back?</Text>
        <Text style={styles.subtitle}>Order #{params.orderNumber}</Text>

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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bankList}
            >
              {banks.map((b) => (
                <Pressable
                  key={b.code}
                  onPress={() => {
                    setBankCode(b.code);
                    setVerifiedName(null);
                    setVerifyError(null);
                  }}
                  style={[
                    styles.bankChip,
                    bankCode === b.code && styles.bankChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.bankChipText,
                      bankCode === b.code && styles.bankChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {b.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

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
              method === 'CASH'
                ? 'Record cash refund'
                : method === 'TRANSFER'
                  ? 'Send to super admin'
                  : 'Pick a method'
            }
            size="lg"
            fullWidth
            disabled={
              !method ||
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
  bankList: { gap: spacing[2], paddingVertical: 4 },
  bankChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: radius.full,
    backgroundColor: colors.surface[1],
  },
  bankChipActive: {
    borderColor: colors.ink[900],
    backgroundColor: colors.ink[900],
  },
  bankChipText: { ...text.xs, color: colors.ink[700], fontWeight: '600' },
  bankChipTextActive: { color: '#fff' },

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
});
