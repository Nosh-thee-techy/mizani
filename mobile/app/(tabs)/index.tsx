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
  Image,
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
import {
  api,
  CashCrisisResponse,
  FinancingPackResponse,
  kes,
  OverviewResponse,
  TrustScoresResponse,
} from '@/lib/api';

const MIZIZI_FULL = require('@/assets/images/mizizi-full.png');
const MIZIZI_AVATAR = require('@/assets/images/mizizi-avatar.png');
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
  const [crisis, setCrisis] = useState<CashCrisisResponse | null>(null);
  const [trust, setTrust] = useState<TrustScoresResponse | null>(null);
  const [finance, setFinance] = useState<FinancingPackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [overview, crisisData, trustData, financeData] = await Promise.all([
        api.overview(7),
        api.cashCrisis().catch(() => null),
        api.trustScores(5).catch(() => null),
        api.financingPack().catch(() => null),
      ]);
      setData(overview);
      setCrisis(crisisData);
      setTrust(trustData);
      setFinance(financeData);
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

        {/* ── Hero: Mizizi first ─────────────────────────────── */}
        <LinearGradient
          colors={[c.gradientStart, c.gradientEnd]}
          style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.heroBadge, { backgroundColor: '#F59E0B' }]}>
                <Ionicons name="logo-electron" size={18} color="#FFFDF8" />
              </View>
              <View>
                <Text style={styles.heroTitle}>Mizani</Text>
                <Text style={styles.heroSubtitle}>
                  Business Pulse · last {m?.period_days ?? 7} days
                </Text>
              </View>
            </View>
          </View>

          {/* Large Mizizi portrait + talk CTA */}
          <Pressable
            onPress={() => router.push('/mizizi')}
            accessibilityRole="button"
            accessibilityLabel="Talk to Mizizi"
            style={({ pressed }) => [
              styles.miziziHero,
              { opacity: pressed ? 0.92 : 1 },
            ]}>
            <View style={styles.miziziPortraitWrap}>
              <View style={styles.miziziGlow} />
              <Image
                source={MIZIZI_FULL}
                style={styles.miziziPortrait}
                resizeMode="cover"
              />
              <View style={styles.miziziOnlineDot} />
            </View>
            <View style={styles.miziziCopy}>
              <Text style={styles.miziziName}>Mizizi</Text>
              <Text style={styles.miziziTagline}>Your wholesaler co-helper</Text>
              <Text style={styles.miziziHint}>
                Sales today · who owes me · who gets goods
              </Text>
              <View style={styles.talkPill}>
                <Ionicons name="mic" size={18} color="#0F6B4C" />
                <Text style={styles.talkPillText}>Talk to Mizizi</Text>
              </View>
            </View>
          </Pressable>
        </LinearGradient>

        {/* ── Content area ─────────────────────────────────── */}
        <View style={styles.content}>
          {error ? <ErrorText message={error} /> : null}

          {/* WhatsApp simulation — sits on white like a chat preview */}
          <Pressable
            onPress={() => router.push('/mizizi-os')}
            accessibilityRole="button"
            accessibilityLabel="Open Mizizi OS WhatsApp simulation"
            style={({ pressed }) => [
              styles.waCard,
              {
                backgroundColor: c.surface,
                borderColor: c.border,
                opacity: pressed ? 0.92 : 1,
                shadowColor: c.shadow,
              },
            ]}>
            <View style={styles.waCardTop}>
              <View style={styles.waAvatarWrap}>
                <Image source={MIZIZI_AVATAR} style={styles.waAvatar} />
                <View style={styles.waBadge}>
                  <Ionicons name="logo-whatsapp" size={12} color="#FFF" />
                </View>
              </View>
              <View style={styles.waCopy}>
                <Text style={[styles.waTitleLight, { color: c.text }]}>Mizizi OS</Text>
                <Text style={[styles.waPreviewLight, { color: c.textMuted }]} numberOfLines={1}>
                  WhatsApp simulation · cash, credit & deliveries
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
            </View>
            <View style={[styles.waBubble, { backgroundColor: '#E7F8EE' }]}>
              <Text style={[styles.waBubbleText, { color: c.text }]} numberOfLines={2}>
                Habari — ask me “who owes me money?” or “who should get goods today?”
              </Text>
            </View>
          </Pressable>

          {/* Weekly cash — white section, clearer layout */}
          <SectionLabel label="This week’s cash" />
          <Card elevated>
            <View style={styles.cashHeader}>
              <Text style={[styles.cashTitle, { color: c.text }]}>Cash flow</Text>
              <Muted>Last {m?.period_days ?? 7} days</Muted>
            </View>
            <View style={styles.cashCols}>
              <View style={[styles.cashCol, { backgroundColor: c.successBg }]}>
                <View style={styles.cashColHead}>
                  <Ionicons name="arrow-down-circle" size={16} color={c.success} />
                  <Muted>Inflow</Muted>
                </View>
                <Text style={[styles.cashValue, { color: c.success }]}>
                  {kes(m?.period_money_in ?? 0)}
                </Text>
              </View>
              <View style={[styles.cashCol, { backgroundColor: c.dangerBg }]}>
                <View style={styles.cashColHead}>
                  <Ionicons name="arrow-up-circle" size={16} color={c.danger} />
                  <Muted>Outflow</Muted>
                </View>
                <Text style={[styles.cashValue, { color: c.danger }]}>
                  {kes(m?.period_money_out ?? 0)}
                </Text>
              </View>
            </View>
            <View style={[styles.cashTrack, { backgroundColor: c.border }]}>
              <View
                style={{
                  flex: Math.max(1, m?.period_money_in ?? 0),
                  backgroundColor: c.success,
                  borderTopLeftRadius: 5,
                  borderBottomLeftRadius: 5,
                }}
              />
              <View
                style={{
                  flex: Math.max(1, m?.period_money_out ?? 0),
                  backgroundColor: c.danger,
                  borderTopRightRadius: 5,
                  borderBottomRightRadius: 5,
                }}
              />
            </View>
            <View style={styles.cashNetRow}>
              <Muted>Net this week</Muted>
              <Text
                style={[
                  styles.cashNet,
                  {
                    color:
                      (m?.period_money_in ?? 0) - (m?.period_money_out ?? 0) >= 0
                        ? c.success
                        : c.danger,
                  },
                ]}>
                {kes((m?.period_money_in ?? 0) - (m?.period_money_out ?? 0))}
              </Text>
            </View>
            {buyers.length > 0 ? (
              <View style={[styles.shareBlock, { borderTopColor: c.border }]}>
                <Muted style={{ marginBottom: 8 }}>Sales share by buyer</Muted>
                <View style={styles.shareRow}>
                  {buyers.slice(0, 4).map((b, idx) => {
                    const colors = [c.tint, c.accent, c.gold, c.info];
                    return (
                      <View
                        key={b.name}
                        style={[
                          styles.shareSeg,
                          {
                            flex: Math.max(12, b.total_amount),
                            backgroundColor: colors[idx % colors.length],
                          },
                        ]}>
                        <Text style={styles.shareSegText} numberOfLines={1}>
                          {initials(b.name)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </Card>

          {crisis ? (
            <>
              <SectionLabel label="Cash Crisis Mode" />
              <Pressable onPress={() => router.push('/mizizi-os')}>
                <Card elevated>
                  <View style={styles.crisisHeader}>
                    <Badge
                      label={String(crisis.severity).toUpperCase()}
                      variant={
                        crisis.severity === 'critical'
                          ? 'danger'
                          : crisis.severity === 'warning'
                            ? 'warning'
                            : 'info'
                      }
                    />
                    <Muted>{crisis.as_of}</Muted>
                  </View>
                  <Body style={{ marginTop: 8 }}>{crisis.headline}</Body>
                  <View style={[styles.row, { marginTop: 10 }]}>
                    <View style={[styles.half, styles.miniMetric, { backgroundColor: c.warningBg }]}>
                      <Text style={[styles.miniValue, { color: c.warning }]}>
                        {kes(crisis.open_receivables)}
                      </Text>
                      <Muted>Open receivables</Muted>
                    </View>
                    <View style={[styles.half, styles.miniMetric, { backgroundColor: c.dangerBg }]}>
                      <Text style={[styles.miniValue, { color: c.danger }]}>
                        {kes(crisis.overdue_30_plus)}
                      </Text>
                      <Muted>30+ days overdue</Muted>
                    </View>
                  </View>
                  <Muted style={{ marginTop: 8 }}>{crisis.runway_hint}</Muted>
                  {(crisis.recommended_actions || []).slice(0, 2).map((a) => (
                    <Text key={a.detail} style={[styles.actionLine, { color: c.text }]}>
                      • {a.detail}
                    </Text>
                  ))}
                </Card>
              </Pressable>
            </>
          ) : null}

          {trust?.buyers?.length ? (
            <>
              <SectionLabel label="Buyer Trust Scores" />
              <Card>
                {trust.buyers.slice(0, 4).map((b, i) => (
                  <View key={b.name}>
                    <View style={styles.trustRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.buyerName, { color: c.text }]}>{b.name}</Text>
                        <Muted>
                          {b.band}
                          {b.credit_hold ? ' · credit hold' : ''} · open {kes(b.open_amount)}
                        </Muted>
                      </View>
                      <Text
                        style={[
                          styles.trustScore,
                          {
                            color:
                              b.trust_score >= 80
                                ? c.success
                                : b.trust_score >= 55
                                  ? c.warning
                                  : c.danger,
                          },
                        ]}>
                        {b.trust_score}
                      </Text>
                    </View>
                    {i < Math.min(3, trust.buyers.length - 1) && (
                      <View style={[styles.itemDivider, { backgroundColor: c.border }]} />
                    )}
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {finance ? (
            <>
              <SectionLabel label="Financing Bridge" />
              <Pressable onPress={() => router.push('/mizizi-os')}>
                <Card>
                  <View style={styles.crisisHeader}>
                    <Text style={[styles.buyerName, { color: c.text }]}>Receivables pack</Text>
                    <Badge label={`${finance.readiness_score}/100`} variant="info" />
                  </View>
                  <Muted style={{ marginTop: 6 }}>
                    Eligible collateral ~ {kes(finance.summary.eligible_collateral_estimate)} ·{' '}
                    {finance.summary.high_risk_buyers} high-risk buyers
                  </Muted>
                  <Body style={{ marginTop: 8 }}>
                    Clean books for SACCO/lender talks — not a loan offer.
                  </Body>
                </Card>
              </Pressable>
            </>
          ) : null}

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
  miziziHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 4,
  },
  miziziPortraitWrap: {
    width: 128,
    height: 168,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,253,248,0.92)',
    backgroundColor: '#E8DFD0',
  },
  miziziGlow: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(245,158,11,0.4)',
    zIndex: -1,
  },
  miziziPortrait: {
    width: '100%',
    height: '100%',
  },
  miziziOnlineDot: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#32D583',
    borderWidth: 3,
    borderColor: '#0F6B4C',
  },
  miziziCopy: {
    flex: 1,
    gap: 4,
  },
  miziziName: {
    color: '#FFFDF8',
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  miziziTagline: {
    color: 'rgba(255,253,248,0.88)',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  miziziHint: {
    color: 'rgba(255,253,248,0.62)',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginBottom: 6,
  },
  talkPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    backgroundColor: '#FFFDF8',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  talkPillText: {
    color: '#0F6B4C',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  waCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    marginBottom: 4,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  waCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  waAvatarWrap: {
    width: 48,
    height: 48,
  },
  waAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  waBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFDF8',
  },
  waCopy: { flex: 1 },
  waTitleLight: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  waPreviewLight: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  waBubble: {
    borderRadius: 14,
    borderTopLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  waBubbleText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  cashHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cashTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  cashCols: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  cashCol: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  cashColHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cashValue: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
  },
  cashTrack: {
    height: 10,
    borderRadius: 5,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cashNetRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cashNet: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  shareBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  shareRow: { flexDirection: 'row', gap: 6, height: 28 },
  shareSeg: {
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  shareSegText: {
    color: '#FFFDF8',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  crisisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionLine: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  trustScore: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  miniMetric: {
    borderRadius: 12,
    padding: 10,
  },
  miniValue: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    marginBottom: 2,
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
