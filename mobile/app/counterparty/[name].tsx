/**
 * Counterparty detail — recent transactions for one buyer/supplier.
 */

import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import {
  Body,
  Card,
  ErrorText,
  Loading,
  Muted,
  Screen,
  Title,
} from '@/components/Ui';
import { api, kes } from '@/lib/api';

type Tx = {
  id: number;
  counterparty_name: string;
  amount: number;
  transaction_date: string;
  direction: string;
  status: string;
  notes: string | null;
};

export default function CounterpartyDetail() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const decoded = decodeURIComponent(name || '');
  const [txs, setTxs] = useState<Tx[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.counterpartyTxs(decoded);
        if (alive) setTxs(res.transactions as Tx[]);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Load failed');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [decoded]);

  return (
    <Screen>
      <Stack.Screen options={{ title: decoded || 'Counterparty' }} />
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          contentContainerStyle={styles.pad}
          data={txs}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={
            <View style={{ marginBottom: 12 }}>
              <Title>{decoded}</Title>
              <Muted>Recent ledger activity</Muted>
              {error ? <ErrorText message={error} /> : null}
            </View>
          }
          ListEmptyComponent={
            <Card>
              <Body>No transactions for this name.</Body>
            </Card>
          }
          renderItem={({ item }) => (
            <Card>
              <Body>
                #{item.id} · {kes(item.amount)}
              </Body>
              <Muted>
                {item.transaction_date} · {item.direction} · {item.status}
              </Muted>
              {item.notes ? <Body>{item.notes}</Body> : null}
            </Card>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 40 },
});
