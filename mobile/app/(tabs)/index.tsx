/**
 * Pulse — Mizani business dashboard hero screen.
 *
 * Design: Modern Dark (Cinema Mobile) per ui-ux-pro-max skill.
 * — Gradient hero strip with Gemma AI narrative in frosted-glass card
 * — 2×2 StatCard grid for key financial metrics
 * — Horizontal badge strip for action flags (mismatches, drafts, gaps)
 * — Top buyers ranked list with progress bars
 * — Pull-to-refresh with brand spinner
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';

import {
  Badge,
  Body,
  Card,
  ErrorText,
  Loading,
  Muted,
  Screen,
  SectionLabel,
  StatCard,
  useTheme,
} from '@/components/Ui';
import { api, kes, OverviewResponse } from '@/lib/api';

// ── Avatar initials helper ────────────────────────────────────
function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ── Buyer progress bar ────────────────────────────────────────
function BuyerRow({
  name,
  amount,
  maxAmount,
  txCount,
}: {
  name: string;
  amount: number;
  maxAmount: number;
  txCount: number;
}) {
  const c = useTheme();
  const pct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
  return (
    <View style={styles.buyerRow}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: c.tint + '22' }]}>
        <Text style={[styles.avatarText, { color: c.tint }]}>{initials(name)}</Text>
      </View>
      {/* Info */}
      <View style={{ flex: 1 }}>
        <View style={styles.buyerTopRow}>
          <Text style={[styles.buyerName, { color: c.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.buyerAmount, { color: c.text }]}>{kes(amount)}</Text>
        </View>
        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${pct}%` as any, backgroundColor: c.tint },
            ]}
          />
        </View>
        <Text style={[styles.buyerMeta, { color: c.textMuted }]}>{txCount} transactions</Text>
      </View>
    </View>
  );
}

// ── Flag chip for attention strip ─────────────────────────────
function FlagChip({
  icon,
  count,
  label,
  variant,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  count: number;
  label: string;
  variant: 'danger' | 'warning' | 'info' | 'neutral';
  onPress: () => void;
}) {
  const c = useTheme();
  const colorMap = {
    danger:  c.danger,
    warning: c.warning,
    info:    c.tint,
    neutral: c.textMuted,
  };
  const bgMap = {
    danger:  c.dangerBg,
    warning: c.warningBg,
    info:    c.successBg,
    neutral: c.surface,
  };
  const col = colorMap[variant];
  const bg  = bgMap[variant];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.flagChip,
        {
          backgroundColor: bg,
          borderColor: col + '44',
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <Ionicons name={icon} size={14} color={col} />
      <Text style={[styles.flagCount, { color: col }]}>{count}</Text>
      <Text style={[styles.flagLabel, { color: col }]}>{label}</Text>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function PulseScreen() {
  const c = useTheme();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.overview(7));
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
        <Loading label="Loading your pulse…" />
      </Screen>
    );
  }

  const m = data?.metrics;
  const buyers = m?.top_buyers ?? [];
  const maxBuyer = buyers.reduce((max, b) => Math.max(max, b.total_amount), 0);

  const totalFlags =
    (m?.open_mismatches ?? 0) +
    (m?.pending_drafts ?? 0) +
    (m?.delivery_discrepancies ?? 0) +
    (m?.pending_deliveries ?? 0);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={load}
            tintColor={c.tint}
            colors={[c.tint]}
          />
        }>

        {/* ── Hero Gradient Header ──────────────────────────── */}
        <LinearGradient
          colors={[c.gradientStart, c.gradientEnd]}
          style={styles.hero}>
          {/* Branding logo row */}
          <View style={styles.heroTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.heroBadge, { backgroundColor: '#F59E0B' }]}>
                <Ionicons name="scale-outline" size={18} color="#FFFDF8" />
              </View>
              <View>
                <Text style={styles.heroTitle}>Mizani</Text>
                <Text style={styles.heroSubtitle}>
                  Business Pulse · last {m?.period_days ?? 7} days
                </Text>
              </View>
            </View>
          </View>

          {/* Graphical Summary Chart Card */}
          <View style={[styles.narrativeCard, { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.2)' }]}>
            <View style={styles.narrativeHeader}>
              <Ionicons name="bar-chart-outline" size={14} color="#FFFDF8" />
              <Text style={styles.narrativeLabel}>Weekly Cash Flow & Sales Share</Text>
            </View>
            
            {/* 1. Cash In vs Cash Out Comparison Tracker */}
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: '#FFFDF8', fontSize: 11, fontFamily: 'Inter_500Medium' }}>Cash Inflow</Text>
                <Text style={{ color: '#FFFDF8', fontSize: 11, fontFamily: 'Inter_500Medium' }}>Cash Outflow</Text>
              </View>
              {/* Dual bar chart tracker */}
              <View style={{ height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.15)', flexDirection: 'row', overflow: 'hidden' }}>
                <View
                  style={{
                    flex: Math.max(1, m?.period_money_in ?? 0),
                    backgroundColor: c.success,
                  }}
                />
                <View
                  style={{
                    flex: Math.max(1, m?.period_money_out ?? 0),
                    backgroundColor: c.danger,
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ color: c.success, fontSize: 11, fontWeight: '700', fontFamily: 'Inter_700Bold' }}>
                  {kes(m?.period_money_in ?? 0)}
                </Text>
                <Text style={{ color: c.danger, fontSize: 11, fontWeight: '700', fontFamily: 'Inter_700Bold' }}>
                  {kes(m?.period_money_out ?? 0)}
                </Text>
              </View>
            </View>

            {/* 2. Top Buyers Share representation */}
            {buyers.length > 0 && (
              <View style={{ marginTop: 14, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 10 }}>
                <Text style={{ color: '#FFFDF8', fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 6 }}>
                  Top Buyers Distribution
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, height: 24 }}>
                  {buyers.map((b, idx) => {
                    const pctShare = maxBuyer > 0 ? (b.total_amount / maxBuyer) * 100 : 0;
                    const colors = [c.tint, c.accent, '#10B981', '#3B82F6'];
                    const col = colors[idx % colors.length];
                    return (
                      <View
                        key={b.name}
                        style={{
                          flex: Math.max(10, pctShare),
                          backgroundColor: col,
                          borderRadius: 4,
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingHorizontal: 4,
                        }}
                      >
                        <Text style={{ color: '#FFFDF8', fontSize: 9, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
                          {initials(b.name)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* ── Content area ─────────────────────────────────── */}
        <View style={styles.content}>
          {error ? <ErrorText message={error} /> : null}

          {/* Metric grid 2×2 */}
          <SectionLabel label="Balances" />
          <View style={styles.row}>
            <StatCard
              label="Owed to you"
              value={kes(m?.total_owed_to_wholesaler ?? 0)}
              accent={c.success}
              style={styles.half}
            />
            <StatCard
              label="You owe"
              value={kes(m?.total_owed_by_wholesaler ?? 0)}
              accent={c.warning}
              style={styles.half}
            />
          </View>
          <View style={styles.row}>
            <StatCard
              label={`Money in (${m?.period_days ?? 7}d)`}
              value={kes(m?.period_money_in ?? 0)}
              accent={c.tint}
              style={styles.half}
            />
            <StatCard
              label={`Money out (${m?.period_days ?? 7}d)`}
              value={kes(m?.period_money_out ?? 0)}
              accent={c.accent}
              style={styles.half}
            />
          </View>

          {/* Attention strip */}
          {totalFlags > 0 && (
            <>
              <SectionLabel label="Needs Attention" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.flagStrip}>
                {(m?.open_mismatches ?? 0) > 0 && (
                  <FlagChip
                    icon="alert-circle-outline"
                    count={m!.open_mismatches}
                    label="mismatches"
                    variant="danger"
                    onPress={() => router.push('/(tabs)/inbox?tab=mismatches')}
                  />
                )}
                {(m?.pending_drafts ?? 0) > 0 && (
                  <FlagChip
                    icon="mail-unread-outline"
                    count={m!.pending_drafts}
                    label="drafts"
                    variant="warning"
                    onPress={() => router.push('/(tabs)/inbox?tab=drafts')}
                  />
                )}
                {(m?.delivery_discrepancies ?? 0) > 0 && (
                  <FlagChip
                    icon="warning-outline"
                    count={m!.delivery_discrepancies}
                    label="stock gaps"
                    variant="danger"
                    onPress={() => router.push('/(tabs)/goods')}
                  />
                )}
                {(m?.pending_deliveries ?? 0) > 0 && (
                  <FlagChip
                    icon="cube-outline"
                    count={m!.pending_deliveries}
                    label="in transit"
                    variant="info"
                    onPress={() => router.push('/(tabs)/goods')}
                  />
                )}
              </ScrollView>
            </>
          )}

          {/* Top buyers */}
          {buyers.length > 0 && (
            <>
              <SectionLabel label="Top Buyers" />
              <Card>
                {buyers.map((b, i) => (
                  <View key={b.name}>
                    <BuyerRow
                      name={b.name}
                      amount={b.total_amount}
                      maxAmount={maxBuyer}
                      txCount={b.tx_count}
                    />
                    {i < buyers.length - 1 && (
                      <View style={[styles.itemDivider, { backgroundColor: c.border }]} />
                    )}
                  </View>
                ))}
              </Card>
            </>
          )}

          {/* Footer metadata */}
          <Muted style={styles.footer}>
            Pulled {data?.generated_at ? new Date(data.generated_at).toLocaleString() : '—'} ·{' '}
            {api.baseUrl}
          </Muted>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  hero: {
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 20,
    gap: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#FFFDF8',
    letterSpacing: -1,
  },
  heroSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,253,248,0.7)',
    marginTop: 2,
  },
  heroBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  narrativeCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  narrativeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  narrativeLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    color: '#F59E0B',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  narrativeText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,253,248,0.9)',
    lineHeight: 22,
  },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 0 },
  half: { flex: 1, marginBottom: 10 },
  flagStrip: { marginBottom: 8 },
  flagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    gap: 5,
  },
  flagCount: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  flagLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  buyerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  buyerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  buyerName: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  buyerAmount: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  buyerMeta: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  itemDivider: { height: 1, marginVertical: 2 },
  footer: {
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 8,
    fontSize: 11,
  },
});
