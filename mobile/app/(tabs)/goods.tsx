/**
 * Goods — inventory-style Stock Trail activity + dispatch photo capture.
 */

import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  Body,
  Card,
  ErrorText,
  Loading,
  Muted,
  PrimaryButton,
  Screen,
  Title,
  useTheme,
} from '@/components/Ui';
import { api, DeliveryRow, kes } from '@/lib/api';

export default function GoodsScreen() {
  const c = useTheme();
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [txId, setTxId] = useState('');
  const [qty, setQty] = useState('50');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.goods();
      setRows(res.deliveries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load goods');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const onDispatch = async () => {
    const id = Number(txId);
    if (!id) {
      Alert.alert('Enter a transaction id for this dispatch');
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (shot.canceled || !shot.assets[0]) return;

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const invoiceQty = qty ? Number(qty) : undefined;
      const result = await api.dispatch(id, shot.assets[0].uri, invoiceQty);
      setMessage(
        `Dispatched ${result.extraction?.estimated_quantity ?? '?'} units for tx #${id}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dispatch failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading && rows.length === 0) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        contentContainerStyle={styles.pad}
        data={rows}
        keyExtractor={(item) => String(item.delivery_id)}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <Title>Goods</Title>
            <Muted>Stock Trail — dispatch, in transit, matched or flagged</Muted>
            {error ? <ErrorText message={error} /> : null}
            {message ? (
              <Card>
                <Body>{message}</Body>
              </Card>
            ) : null}
            <Card>
              <Muted>New dispatch photo</Muted>
              <Muted>Transaction id</Muted>
              <TextInput
                value={txId}
                onChangeText={setTxId}
                keyboardType="number-pad"
                placeholder="e.g. 7"
                placeholderTextColor={c.textMuted}
                style={[
                  styles.input,
                  { borderColor: c.border, color: c.text, backgroundColor: c.surface },
                ]}
              />
              <Muted>Invoice quantity (optional)</Muted>
              <TextInput
                value={qty}
                onChangeText={setQty}
                keyboardType="number-pad"
                style={[
                  styles.input,
                  { borderColor: c.border, color: c.text, backgroundColor: c.surface },
                ]}
              />
              <PrimaryButton
                label={busy ? 'Uploading…' : 'Camera · dispatch'}
                onPress={onDispatch}
                disabled={busy}
              />
            </Card>
          </View>
        }
        ListEmptyComponent={
          <Card>
            <Body>No deliveries yet. Dispatch stock or run the contacts seed.</Body>
          </Card>
        }
        renderItem={({ item }) => (
          <Card>
            <Body>
              #{item.delivery_id} · {item.counterparty_name}
            </Body>
            <Muted>
              Tx #{item.transaction_id} · {kes(item.amount)} · {item.transaction_date}
            </Muted>
            <Body>
              {item.dispatched_quantity ?? '?'} out → {item.receipt_confirmed_quantity ?? '—'} in
            </Body>
            <Muted>Status: {item.match_status}</Muted>
            {item.discrepancy_notes ? <Body>{item.discrepancy_notes}</Body> : null}
          </Card>
        )}
      />
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
