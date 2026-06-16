import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type BarcodeType,
} from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { colors, radius, spacing, text } from '@/theme';

// Retail barcodes we expect. `qr` is included because some internal labels
// and the POS flow may carry QR-encoded SKUs.
const BARCODE_TYPES: BarcodeType[] = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'code93',
  'itf14',
  'qr',
];

// A physical scan fires onBarcodeScanned several times. Ignore repeats of
// the SAME value within this window so one barcode = one resolution.
const SAME_CODE_DEBOUNCE_MS = 1500;

interface Props {
  /** Called with the decoded value. Debounced for repeated identical scans. */
  onScan: (data: string, type: string) => void;
  /**
   * When false, the camera stays mounted but stops dispatching scans.
   * Use this while a scan is being processed (e.g. an API call in flight)
   * so the user can't fire a burst of lookups.
   */
  active?: boolean;
  /** Helper text rendered below the scan box. */
  hint?: string;
  /**
   * Show the built-in "Enter code manually" fallback (default true).
   * Set false on a screen that renders its own manual-entry UI, so it
   * isn't duplicated.
   */
  showManualEntry?: boolean;
}

export function BarcodeScanner({
  onScan,
  active = true,
  hint,
  showManualEntry = true,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [flashFeedback, setFlashFeedback] = useState(false);
  // Manual entry: a fallback for when the camera misreads a barcode. The
  // staff can type the raw code; it runs the exact same onScan path.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Tracks the last scanned value + when, for debouncing identical scans.
  const lastScanRef = useRef<{ data: string; at: number } | null>(null);

  // Reset the debounce memory when the scanner is re-activated so the same
  // item CAN be re-scanned after a deliberate pause.
  useEffect(() => {
    if (active) {
      lastScanRef.current = null;
    }
  }, [active]);

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (!active) return;
      const data = result.data?.trim();
      if (!data) return;

      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.data === data && now - last.at < SAME_CODE_DEBOUNCE_MS) {
        return; // Same code, too soon — ignore the camera's repeat fire.
      }
      lastScanRef.current = { data, at: now };

      // Feedback: haptic tap + brief green flash overlay.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      setFlashFeedback(true);
      setTimeout(() => setFlashFeedback(false), 220);

      onScan(data, result.type);
    },
    [active, onScan],
  );

  // Submit a manually typed code. Routes through the SAME onScan callback
  // as a camera scan, so every downstream action is identical. Bypasses
  // the camera debounce (a deliberate keystroke is never an accidental
  // repeat), but still respects `active` so it can't fire mid-processing.
  const submitManualCode = useCallback(() => {
    if (!active) return;
    const code = manualCode.trim();
    if (!code) return;
    Keyboard.dismiss();
    setManualCode('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    onScan(code, 'manual');
  }, [active, manualCode, onScan]);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  // ── Permission states ──

  if (!permission) {
    // Still resolving the initial permission status.
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.ink[900]} />
      </View>
    );
  }

  if (!permission.granted) {
    const canAsk = permission.canAskAgain;
    return (
      <View style={styles.center}>
        <View style={styles.permIcon}>
          <Ionicons name="camera-outline" size={32} color={colors.ink[400]} />
        </View>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          {canAsk
            ? 'Allow camera access to scan barcodes and QR codes.'
            : 'Camera permission was denied. Enable it in Settings to scan barcodes.'}
        </Text>
        {canAsk ? (
          <Button
            title="Allow camera"
            size="md"
            onPress={() => {
              void requestPermission();
            }}
            style={{ marginTop: spacing[4] }}
          />
        ) : (
          <Button
            title="Open Settings"
            size="md"
            variant="outline"
            onPress={openSettings}
            style={{ marginTop: spacing[4] }}
          />
        )}
      </View>
    );
  }

  // ── Camera + overlay ──

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
        // Only dispatch scans while active; passing undefined fully
        // suspends barcode detection in the native layer.
        onBarcodeScanned={active ? handleBarcodeScanned : undefined}
        barcodeScannerSettings={{
          barcodeTypes: BARCODE_TYPES,
        }}
      />

      {/* Dim mask with a clear rectangular cut-out in the middle. */}
      <View style={styles.maskRow} />
      <View style={styles.maskCenterRow}>
        <View style={styles.maskSide} />
        <View
          style={[
            styles.scanBox,
            flashFeedback && styles.scanBoxFlash,
          ]}
        >
          {/* Corner brackets */}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <View style={styles.maskSide} />
      </View>
      <View style={styles.maskRowBottom}>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {!active ? (
          <View style={styles.processingBadge}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.processingText}>Processing…</Text>
          </View>
        ) : null}
      </View>

      {/* Torch toggle — bottom right */}
      <View style={styles.torchWrap}>
        <Button
          title={torchOn ? 'Torch on' : 'Torch'}
          size="sm"
          variant={torchOn ? 'secondary' : 'outline'}
          icon={
            <Ionicons
              name={torchOn ? 'flashlight' : 'flashlight-outline'}
              size={14}
              color={torchOn ? '#fff' : colors.ink[900]}
            />
          }
          onPress={() => setTorchOn((v) => !v)}
          style={
            torchOn
              ? undefined
              : { backgroundColor: 'rgba(255,255,255,0.92)' }
          }
        />
      </View>

      {/* Manual entry — fallback for a misreading camera. Anchored to the
          bottom; collapsed to a single tappable row until opened. A screen
          with its own manual-entry UI passes showManualEntry={false}. */}
      {showManualEntry ? (
      <View style={styles.manualWrap}>
        {manualOpen ? (
          <View style={styles.manualPanel}>
            <View style={styles.manualHeaderRow}>
              <Text style={styles.manualTitle}>Enter code manually</Text>
              <TouchableOpacity
                onPress={() => {
                  setManualOpen(false);
                  setManualCode('');
                  Keyboard.dismiss();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={colors.ink[500]} />
              </TouchableOpacity>
            </View>
            <View style={styles.manualInputRow}>
              <TextInput
                style={styles.manualInput}
                value={manualCode}
                onChangeText={setManualCode}
                placeholder="Barcode or SKU"
                placeholderTextColor={colors.ink[400]}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={submitManualCode}
                editable={active}
              />
              <Button
                title="Submit"
                size="md"
                onPress={submitManualCode}
                disabled={!active || manualCode.trim().length === 0}
              />
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.manualToggle}
            onPress={() => setManualOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="keypad-outline" size={16} color="#fff" />
            <Text style={styles.manualToggleText}>Enter code manually</Text>
          </TouchableOpacity>
        )}
      </View>
      ) : null}
    </View>
  );
}

const SCAN_BOX = 260;
const CORNER = 28;
const CORNER_WIDTH = 4;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    backgroundColor: colors.surface[0],
  },
  permIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.surface[1],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  permTitle: {
    ...text.lg,
    fontWeight: '700',
    color: colors.ink[900],
    marginBottom: spacing[2],
  },
  permBody: {
    ...text.sm,
    color: colors.ink[500],
    textAlign: 'center',
    lineHeight: 22,
  },

  // Dim mask layers
  maskRow: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  maskCenterRow: {
    flexDirection: 'row',
    height: SCAN_BOX,
  },
  maskSide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  maskRowBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    paddingTop: spacing[6],
    gap: spacing[3],
  },

  scanBox: {
    width: SCAN_BOX,
    height: SCAN_BOX,
    borderRadius: radius.lg,
  },
  scanBoxFlash: {
    backgroundColor: 'rgba(14,124,58,0.35)', // green flash on a successful read
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: '#fff',
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: radius.lg,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: radius.lg,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderBottomLeftRadius: radius.lg,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderBottomRightRadius: radius.lg,
  },

  hint: {
    ...text.sm,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    paddingHorizontal: spacing[6],
  },
  processingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radius.full,
  },
  processingText: { ...text.sm, color: '#fff', fontWeight: '600' },

  torchWrap: {
    position: 'absolute',
    right: spacing[4],
    bottom: spacing[6],
  },

  // Manual entry — anchored bottom-left so it never collides with the
  // torch button on the bottom-right.
  manualWrap: {
    position: 'absolute',
    left: spacing[4],
    bottom: spacing[6],
  },
  manualToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radius.full,
  },
  manualToggleText: { ...text.sm, color: '#fff', fontWeight: '600' },
  manualPanel: {
    // Span almost the full width when open so the input is comfortable.
    width: 300,
    maxWidth: '100%',
    backgroundColor: colors.surface[0],
    borderRadius: radius.lg,
    padding: spacing[3],
    gap: spacing[2],
  },
  manualHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manualTitle: {
    ...text.sm,
    fontWeight: '700',
    color: colors.ink[900],
  },
  manualInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  manualInput: {
    flex: 1,
    ...text.base,
    color: colors.ink[900],
    backgroundColor: colors.surface[1],
    borderWidth: 1,
    borderColor: colors.ink[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
});
