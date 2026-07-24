/**
 * Customers & suppliers — who the wholesaler sells to / buys from.
 */

import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Body,
  Card,
  ErrorText,
  Loading,
  Muted,
  Screen,
  Title,
  useTheme,
} from '@/components/Ui';
import { api, Counterparty, kes } from '@/lib/api';

export default function CustomersScreen() {
  const c = useTheme();
  const [items, setItems] = useState<Counterparty[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.counterparties(30);
      setItems(res.counterparties);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
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

  if (loading && items.length === 0) {
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
        data={items}
        keyExtractor={(item) => item.name}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <Title>People</Title>
            <Muted>Who you sell to and buy from · last 30 days</Muted>
            {error ? <ErrorText message={error} /> : null}
          </View>
        }
        ListEmptyComponent={
          <Card>
            <Body>No counterparties yet. Sync M-PESA or upload a document.</Body>
          </Card>
        }
        renderItem={({ item }) => (
          <Link href={`/counterparty/${encodeURIComponent(item.name)}`} asChild>
            <Pressable>
              <Card>
                <Body>{item.name}</Body>
                <Muted>
                  {item.role} · {item.tx_count} txs · last {item.last_activity || '—'}
                </Muted>
                <View style={styles.row}>
                  <Muted>Sold {kes(item.sold_to)}</Muted>
                  <Muted>Bought {kes(item.bought_from)}</Muted>
                </View>
                {item.open_mismatches > 0 ? (
                  <Text style={{ color: c.danger, marginTop: 6 }}>
                    {item.open_mismatches} open mismatch(es)
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          </Link>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 40 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
});
