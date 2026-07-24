/**
 * Money — Connect M-PESA, sync sandbox transactions, upload document photos.
 *
 * Design: icon-action grid for uploads, styled FieldInput form,
 * slide-in success banner.
 */

import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import {
  Badge,
  Body,
  Card,
  ErrorText,
  FieldInput,
  Loading,
  Muted,
  PrimaryButton,
  Screen,
  SectionLabel,
  SecondaryButton,
  useTheme,
} from '@/components/Ui';
import { api } from '@/lib/api';

// ── Success Banner ────────────────────────────────────────────
function SuccessBanner({ message }: { message: string }) {
  const c = useTheme();
  return (
    <View style={[styles.successBanner, { backgroundColor: c.successBg, borderColor: c.success + '44' }]}>
      <Ionicons name="checkmark-circle" size={18} color={c.success} />
      <Text style={[styles.successText, { color: c.success }]}>{message}</Text>
    </View>
  );
}

// ── Upload action tile ────────────────────────────────────────
function ActionTile({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.actionTile,
        {
          backgroundColor: c.surfaceElevated,
          borderColor: c.border,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}>
      <View style={[styles.tileIconWrap, { backgroundColor: c.tint + '18' }]}>
        <Ionicons name={icon} size={22} color={c.tint} />
      </View>
      <Text style={[styles.tileLabel, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}

// ── Screen ────────────────────────────────────────────────────
export default function MoneyScreen() {
  const c = useTheme();
  const [linked, setLinked] = useState(false);
  const [linkLabel, setLinkLabel] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('Wholesaler Till');
  const [phone, setPhone] = useState('+254700000000');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await api.mpesaStatus();
      setLinked(status.linked);
      const name = status.link?.display_name;
      setLinkLabel(typeof name === 'string' ? name : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status failed');
    }
  }, []);

  const loadDocs = useCallback(async () => {
    try {
      const res = await api.documents();
      setUploadedDocs(res.documents || []);
    } catch (e) {
      // silent fail on initial mount
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
      void loadDocs();
    }, [refreshStatus, loadDocs]),
  );

  const onConnect = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.mpesaConnect(displayName, phone);
      setLinked(res.linked);
      setLinkLabel(String(res.link.display_name || displayName));
      setMessage('Connected to M-PESA (sandbox). Tap Sync to pull statement rows.');
      await loadDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connect failed');
    } finally {
      setBusy(false);
    }
  };

  const onSync = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.mpesaSync(false);
      setMessage(`Synced ${res.inserted} new txs (${res.skipped} already present). Check Pulse.`);
      await refreshStatus();
      await loadDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  };

  const uploadFromUri = async (uri: string, name: string, sourceType: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.uploadDocument(uri, sourceType, name);
      if (result.inserted) {
        setMessage(
          `Extracted ${result.transaction?.counterparty_name || 'entry'} · ${result.transaction?.amount ?? '?'} KES (confidence ${(result.confidence ?? 0).toFixed(2)})`,
        );
      } else {
        setMessage(result.message || 'Low confidence — not inserted.');
      }
      await loadDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const onPickPhoto = async (sourceType: string) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera permission needed'); return; }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
    if (!shot.canceled && shot.assets[0]) {
      await uploadFromUri(shot.assets[0].uri, 'capture.jpg', sourceType);
    }
  };

  const onPickLibrary = async (sourceType: string) => {
    const shot = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!shot.canceled && shot.assets[0]) {
      const asset = shot.assets[0];
      await uploadFromUri(asset.uri, asset.fileName || 'upload.jpg', sourceType);
    }
  };

  const onPickDocument = async () => {
    const doc = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (!doc.canceled && doc.assets[0]) {
      await uploadFromUri(doc.assets[0].uri, doc.assets[0].name, 'bank_statement');
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.pad}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.pageTitle, { color: c.text }]}>Money</Text>
          <Muted>Connect M-PESA or photograph documents</Muted>
        </View>

        {error ? <ErrorText message={error} /> : null}
        {message ? <SuccessBanner message={message} /> : null}

        {/* ── M-PESA card ──────────────────────────────────── */}
        <SectionLabel label="M-PESA" />
        <Card>
          {/* Status row */}
          <View style={styles.mpesaStatusRow}>
            <View style={[styles.mpesaIcon, { backgroundColor: c.tint + '18' }]}>
              <Ionicons name="phone-portrait-outline" size={20} color={c.tint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.mpesaName, { color: c.text }]}>
                {linked ? (linkLabel || 'Wholesaler Till') : 'Not connected'}
              </Text>
              <Badge
                label={linked ? 'Connected' : 'Unlinked'}
                variant={linked ? 'success' : 'warning'}
              />
            </View>
          </View>

          {!linked ? (
            <View style={{ marginTop: 16, gap: 0 }}>
              <FieldInput
                label="Till name"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="e.g. Main Till"
              />
              <FieldInput
                label="Phone number"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="+2547XXXXXXXX"
              />
              <PrimaryButton
                label={busy ? 'Connecting…' : 'Connect M-PESA'}
                onPress={onConnect}
                disabled={busy}
                icon={<Ionicons name="link-outline" size={16} color={c.textOnPrimary} />}
              />
            </View>
          ) : (
            <PrimaryButton
              label={busy ? 'Syncing…' : 'Sync Statement'}
              onPress={onSync}
              disabled={busy}
              icon={<Ionicons name="sync-outline" size={16} color={c.textOnPrimary} />}
            />
          )}
        </Card>

        {/* ── Document upload grid ─────────────────────────── */}
        <SectionLabel label="Upload Documents" />
        <View style={styles.tileGrid}>
          <ActionTile
            icon="camera-outline"
            label="Invoice photo"
            onPress={() => onPickPhoto('invoice')}
            disabled={busy}
          />
          <ActionTile
            icon="document-text-outline"
            label="Bank / M-PESA statement"
            onPress={() => onPickPhoto('bank_statement')}
            disabled={busy}
          />
          <ActionTile
            icon="images-outline"
            label="Photo library"
            onPress={() => onPickLibrary('invoice')}
            disabled={busy}
          />
          <ActionTile
            icon="folder-open-outline"
            label="Pick file (PDF)"
            onPress={onPickDocument}
            disabled={busy}
          />
        </View>

        {/* ── Recently Uploaded History ────────────────────── */}
        {uploadedDocs.length > 0 && (
          <>
            <SectionLabel label="Recently Uploaded" />
            <Card>
              {uploadedDocs.map((doc, idx) => (
                <View key={doc.id}>
                  <View style={styles.historyRow}>
                    <View style={[styles.historyIconWrap, { backgroundColor: c.tint + '18' }]}>
                      <Ionicons
                        name={doc.source_type === 'bank_statement' ? 'document-text-outline' : 'receipt-outline'}
                        size={18}
                        color={c.tint}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.historyHeader}>
                        <Text style={[styles.historyName, { color: c.text }]} numberOfLines={1}>
                          {doc.extracted?.counterparty_name || 'Unrecognized Document'}
                        </Text>
                        <Badge
                          label={doc.source_type}
                          variant={doc.source_type === 'invoice' ? 'info' : 'success'}
                        />
                      </View>
                      <Text style={[styles.historyMeta, { color: c.textMuted }]}>
                        Uploaded: {doc.uploaded_at.split(' ')[0] || doc.uploaded_at} · ID #{doc.id}
                      </Text>
                      {doc.extracted?.amount ? (
                        <Text style={[styles.historyAmt, { color: c.text }]}>
                          Amount: KES {doc.extracted.amount.toLocaleString()}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {idx < uploadedDocs.length - 1 && (
                    <View style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />
                  )}
                </View>
              ))}
            </Card>
          </>
        )}

      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad:     { padding: 20, paddingBottom: 48 },
  header:  { marginBottom: 8 },
  pageTitle: {
    fontSize: 30,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1,
    marginBottom: 4,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  successText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
    lineHeight: 20,
  },
  mpesaStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mpesaIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mpesaName: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    marginBottom: 4,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionTile: {
    width: '47%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 10,
    minHeight: 90,
    justifyContent: 'center',
  },
  tileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  historyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  historyName: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  historyMeta: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginBottom: 4,
  },
  historyAmt: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
  },
});
