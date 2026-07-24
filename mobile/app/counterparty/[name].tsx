/**
 * Counterparty detail — recent transactions for one buyer/supplier.
 * Redesigned with avatar header, transaction cards with direction badges.
 */

import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { memo, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View, Pressable } from 'react-native';

import {
  Badge,
  Card,
  ErrorText,
  Loading,
  Muted,
  Screen,
  SectionLabel,
  useTheme,
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

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function txStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'matched':   return 'success';
    case 'pending':   return 'warning';
    case 'mismatch':  return 'danger';
    default:          return 'neutral';
  }
}

// Memoized transaction row
const TxCard = memo(function TxCard({ item }: { item: Tx }) {
  const c = useTheme();
  const isOut = item.direction === 'PAYABLE';
  return (
    <Card>
      <View style={styles.txRow}>
        {/* Direction icon */}
        <View
          style={[
            styles.txIcon,
            { backgroundColor: isOut ? c.warningBg : c.successBg },
          ]}>
          <Ionicons
            name={isOut ? 'arrow-up-outline' : 'arrow-down-outline'}
            size={16}
            color={isOut ? c.warning : c.success}
          />
        </View>

        {/* Details */}
        <View style={{ flex: 1 }}>
          <View style={styles.txTopRow}>
            <Text style={[styles.txAmount, { color: c.text }]}>{kes(item.amount)}</Text>
            <Badge label={item.status} variant={txStatusVariant(item.status)} />
          </View>
          <Text style={[styles.txMeta, { color: c.textMuted }]}>
            {item.transaction_date} · Tx #{item.id} · {item.direction}
          </Text>
          {item.notes ? (
            <Text style={[styles.txNotes, { color: c.textMuted }]} numberOfLines={2}>
              {item.notes}
            </Text>
          ) : null}

          {/* Action triggers for unresolved ledgers */}
          {item.status === 'unreconciled' && (
            <View style={styles.txActions}>
              <Pressable
                onPress={() => router.push(`/(tabs)/inbox?tab=mismatches&filter=${encodeURIComponent(item.counterparty_name)}`)}
                style={[styles.actionBtn, { borderColor: c.tint }]}>
                <Ionicons name="git-compare-outline" size={13} color={c.tint} style={{ marginRight: 4 }} />
                <Text style={[styles.actionBtnText, { color: c.tint }]}>Match Payment</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push(`/(tabs)/inbox?tab=drafts&filter=${encodeURIComponent(item.counterparty_name)}`)}
                style={[styles.actionBtn, { borderColor: c.warning }]}>
                <Ionicons name="mail-outline" size={13} color={c.warning} style={{ marginRight: 4 }} />
                <Text style={[styles.actionBtnText, { color: c.warning }]}>Send Reminder</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Card>
  );
});

export default function CounterpartyDetail() {
  const c = useTheme();
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
    return () => { alive = false; };
  }, [decoded]);

  // Total in/out
  const totalIn  = txs.filter((t) => t.direction !== 'PAYABLE').reduce((s, t) => s + t.amount, 0);
  const totalOut = txs.filter((t) => t.direction === 'PAYABLE').reduce((s, t) => s + t.amount, 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: decoded || 'Counterparty', headerBackTitle: 'People' }} />

      {loading ? (
        <Loading label={`Loading ${decoded}…`} />
      ) : (
        <FlatList
          contentContainerStyle={styles.pad}
          data={txs}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={
            <View>
              {/* Avatar hero */}
              <View style={styles.avatarHero}>
                <View style={[styles.avatar, { backgroundColor: c.tint + '22' }]}>
                  <Text style={[styles.avatarText, { color: c.tint }]}>{initials(decoded)}</Text>
                </View>
                <Text style={[styles.heroName, { color: c.text }]}>{decoded}</Text>
                <Muted>Ledger activity</Muted>
              </View>

              {/* Summary stat chips */}
              <View style={styles.statsRow}>
                <View style={[styles.statChip, { backgroundColor: c.successBg }]}>
                  <Ionicons name="arrow-down-outline" size={14} color={c.success} />
                  <View>
                    <Text style={[styles.statValue, { color: c.success }]}>{kes(totalIn)}</Text>
                    <Text style={[styles.statLabel, { color: c.success }]}>Received</Text>
                  </View>
                </View>
                <View style={[styles.statChip, { backgroundColor: c.warningBg }]}>
                  <Ionicons name="arrow-up-outline" size={14} color={c.warning} />
                  <View>
                    <Text style={[styles.statValue, { color: c.warning }]}>{kes(totalOut)}</Text>
                    <Text style={[styles.statLabel, { color: c.warning }]}>Paid out</Text>
                  </View>
                </View>
              </View>

              {error ? <ErrorText message={error} /> : null}
              <SectionLabel label={`${txs.length} Transactions`} />
            </View>
          }
          ListEmptyComponent={
            <Card>
              <Text style={[styles.emptyText, { color: c.textMuted }]}>
                No transactions found for this counterparty.
              </Text>
            </Card>
          }
          renderItem={({ item }) => <TxCard item={item} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 48 },
  avatarHero: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  heroName: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    padding: 14,
  },
  statValue: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  txTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  txAmount: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
  txMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  txNotes: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    paddingVertical: 12,
  },
  txActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  actionBtnText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
});
