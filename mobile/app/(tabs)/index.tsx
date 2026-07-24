/**
 * Business pulse — Gemma narrative + money in/out + open flags.
 */

import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import {
  Body,
  Card,
  ErrorText,
  Loading,
  Muted,
  Screen,
  Title,
} from '@/components/Ui';
import { api, kes, OverviewResponse } from '@/lib/api';

export default function PulseScreen() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const overview = await api.overview(7);
      setData(overview);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pulse');
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

  if (loading && !data) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  const m = data?.metrics;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Title>Ledger Chain</Title>
        <Muted>Your business pulse · last {m?.period_days ?? 7} days</Muted>

        {error ? <ErrorText message={error} /> : null}

        <Card style={{ marginTop: 16 }}>
          <Muted>Gemma says</Muted>
          <Body>{data?.narrative || 'No narrative yet — sync M-PESA or upload a statement.'}</Body>
        </Card>

        <View style={styles.row}>
          <Card style={styles.half}>
            <Muted>Owed to you</Muted>
            <Body>{kes(m?.total_owed_to_wholesaler ?? 0)}</Body>
          </Card>
          <Card style={styles.half}>
            <Muted>You owe</Muted>
            <Body>{kes(m?.total_owed_by_wholesaler ?? 0)}</Body>
          </Card>
        </View>

        <View style={styles.row}>
          <Card style={styles.half}>
            <Muted>Money in</Muted>
            <Body>{kes(m?.period_money_in ?? 0)}</Body>
          </Card>
          <Card style={styles.half}>
            <Muted>Money out</Muted>
            <Body>{kes(m?.period_money_out ?? 0)}</Body>
          </Card>
        </View>

        <Card>
          <Muted>Needs attention</Muted>
          <Body>
            {m?.open_mismatches ?? 0} mismatches · {m?.pending_drafts ?? 0} drafts ·{' '}
            {m?.delivery_discrepancies ?? 0} stock gaps · {m?.pending_deliveries ?? 0} in
            transit
          </Body>
        </Card>

        {m?.top_buyers?.length ? (
          <Card>
            <Muted>Who you sold to</Muted>
            {m.top_buyers.map((b) => (
              <View key={b.name} style={styles.buyerRow}>
                <Body>{b.name}</Body>
                <Muted>
                  {kes(b.total_amount)} · {b.tx_count} tx
                </Muted>
              </View>
            ))}
          </Card>
        ) : null}

        <Muted>API {api.baseUrl}</Muted>
        <Muted>
          Pulled {data?.generated_at ? new Date(data.generated_at).toLocaleString() : '—'}
        </Muted>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  buyerRow: { marginTop: 10 },
});
