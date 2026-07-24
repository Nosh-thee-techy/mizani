/**
 * People (Customers) — counterparty list with avatar initials, role badges,
 * sold/bought StatChips, and mismatch warning badges.
 *
 * Performance: renderItem memoized per React Native stack guideline.
 */

import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Body,
  Card,
  ErrorText,
  Loading,
  Muted,
  Screen,
  SectionLabel,
  useTheme,
} from '@/components/Ui';
import { api, Counterparty, kes } from '@/lib/api';

// ── Avatar colour by role ─────────────────────────────────────
function roleColor(role: string, tint: string, accent: string, info: string) {
  if (role === 'buyer')    return tint;
  if (role === 'supplier') return accent;
  return info; // both
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// ── Single counterparty card — memoized ──────────────────────
const CounterpartyCard = memo(function CounterpartyCard({ item }: { item: Counterparty }) {
  const c = useTheme();
  const avatarColor = roleColor(item.role, c.tint, c.accent, c.info);

  return (
    <Card>
      <View style={styles.cardRow}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: avatarColor + '22' }]}>
          <Text style={[styles.avatarText, { color: avatarColor }]}>{initials(item.name)}</Text>
        </View>

        {/* Details */}
        <View style={{ flex: 1 }}>
          {/* Name + role badge */}
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Badge
              label={item.role}
              variant={
                item.role === 'buyer' ? 'success' : item.role === 'supplier' ? 'warning' : 'info'
              }
            />
          </View>

          {/* Activity */}
          <Text style={[styles.meta, { color: c.textMuted }]}>
            {item.tx_count} transactions · last {item.last_activity || 'unknown'}
          </Text>

          {/* Sold / Bought chips */}
          <View style={styles.amountsRow}>
            <View style={[styles.amountChip, { backgroundColor: c.successBg }]}>
              <Ionicons name="arrow-up-outline" size={12} color={c.success} />
              <Text style={[styles.amountText, { color: c.success }]}>
                Sold {kes(item.sold_to)}
              </Text>
            </View>
            <View style={[styles.amountChip, { backgroundColor: c.warningBg }]}>
              <Ionicons name="arrow-down-outline" size={12} color={c.warning} />
              <Text style={[styles.amountText, { color: c.warning }]}>
                Bought {kes(item.bought_from)}
              </Text>
            </View>
          </View>

          {/* Mismatch warning */}
          {item.open_mismatches > 0 && (
            <View style={[styles.mismatchRow, { backgroundColor: c.dangerBg, borderColor: c.danger + '44' }]}>
              <Ionicons name="alert-circle" size={14} color={c.danger} />
              <Text style={[styles.mismatchText, { color: c.danger }]}>
                {item.open_mismatches} open mismatch{item.open_mismatches > 1 ? 'es' : ''}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Card>
  );
});

// ── Main screen ───────────────────────────────────────────────
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
        <Loading label="Loading people…" />
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
          <View style={{ marginBottom: 4 }}>
            <Text style={[styles.pageTitle, { color: c.text }]}>People</Text>
            <Muted>Who you sell to and buy from · last 30 days</Muted>
            {error ? <ErrorText message={error} /> : null}
            <SectionLabel label={`${items.length} Counterparties`} />
          </View>
        }
        ListEmptyComponent={
          <Card>
            <Body>No counterparties yet. Sync M-PESA or upload a document.</Body>
          </Card>
        }
        renderItem={({ item }) => (
          <Link href={`/counterparty/${encodeURIComponent(item.name)}`} asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name}`}>
              <CounterpartyCard item={item} />
            </Pressable>
          </Link>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 48 },
  pageTitle: {
    fontSize: 30,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1,
    marginBottom: 4,
  },
  cardRow:   { flexDirection: 'row', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  avatarText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  name: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    flex: 1,
  },
  meta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginBottom: 8,
  },
  amountsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  amountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  amountText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
  },
  mismatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  mismatchText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
  },
});
