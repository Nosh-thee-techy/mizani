/**
 * Money in — Connect M-PESA, sync sandbox txs, upload statement/invoice photos.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import {
  Body,
  Card,
  ErrorText,
  Muted,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Title,
  useTheme,
} from '@/components/Ui';
import { api } from '@/lib/api';

export default function MoneyScreen() {
  const c = useTheme();
  const [linked, setLinked] = useState(false);
  const [linkLabel, setLinkLabel] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('Wholesaler Till');
  const [phone, setPhone] = useState('+254700000000');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
    }, [refreshStatus]),
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
      setMessage(
        `Synced ${res.inserted} new txs (${res.skipped} already present). Check Pulse.`,
      );
      await refreshStatus();
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
          `Extracted ${result.transaction?.counterparty_name || 'entry'} · ${
            result.transaction?.amount ?? '?'
          } KES (confidence ${(result.confidence ?? 0).toFixed(2)})`,
        );
      } else {
        setMessage(result.message || 'Low confidence — not inserted.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const onPickPhoto = async (sourceType: string) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    });
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
        <Title>Money in</Title>
        <Muted>Connect M-PESA or photograph statements and invoices.</Muted>

        {error ? <ErrorText message={error} /> : null}
        {message ? (
          <Card>
            <Body>{message}</Body>
          </Card>
        ) : null}

        <Card style={{ marginTop: 16 }}>
          <Muted>M-PESA</Muted>
          <Body>
            {linked
              ? `Connected · ${linkLabel || 'Till'}`
              : 'Not connected — link your till for the demo sync.'}
          </Body>

          {!linked ? (
            <View style={{ marginTop: 12 }}>
              <Muted>Till name</Muted>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                style={[styles.input, { borderColor: c.border, color: c.text, backgroundColor: c.surface }]}
              />
              <Muted>Phone</Muted>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                style={[styles.input, { borderColor: c.border, color: c.text, backgroundColor: c.surface }]}
              />
              <PrimaryButton label={busy ? 'Working…' : 'Connect M-PESA'} onPress={onConnect} disabled={busy} />
            </View>
          ) : (
            <PrimaryButton label={busy ? 'Working…' : 'Sync statement'} onPress={onSync} disabled={busy} />
          )}
        </Card>

        <Card>
          <Muted>Photograph or upload</Muted>
          <PrimaryButton
            label="Camera · invoice"
            onPress={() => onPickPhoto('invoice')}
            disabled={busy}
          />
          <SecondaryButton
            label="Camera · bank / M-PESA statement"
            onPress={() => onPickPhoto('bank_statement')}
            disabled={busy}
          />
          <SecondaryButton
            label="Library photo"
            onPress={() => onPickLibrary('invoice')}
            disabled={busy}
          />
          <SecondaryButton label="Pick file (image/PDF)" onPress={onPickDocument} disabled={busy} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 40 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 10,
    fontSize: 16,
  },
});
