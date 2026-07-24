/**
 * Inbox — Mismatches and pending SMS drafts.
 *
 * Design changes from original:
 * — Toggle pill tabs ("Mismatches" / "Drafts") with count badges
 * — Mismatch card: amber left-border accent, direction badge, clear layout
 * — Draft card: SMS-bubble preview for message_text
 * — Approve & SMS is gold full-width primary button (highest CTA priority)
 * — Run reconcile demoted to SecondaryButton (outline) — clear hierarchy
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, useEffect } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Badge,
  Body,
  Card,
  ErrorText,
  Loading,
  Muted,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionLabel,
  useTheme,
} from '@/components/Ui';
import { api, InboxResponse, kes } from '@/lib/api';

type Mismatch = InboxResponse['mismatches'][number];
type Draft    = InboxResponse['pending_drafts'][number];

// ── Tab toggle ────────────────────────────────────────────────
function TabPill({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[
        styles.tabPill,
        {
          backgroundColor: active ? c.tint : c.surface,
          borderColor: active ? c.tint : c.border,
        },
      ]}>
      <Text
        style={[
          styles.tabLabel,
          { color: active ? c.textOnPrimary : c.textMuted },
        ]}>
        {label}
      </Text>
      {count > 0 && (
        <View
          style={[
            styles.tabCount,
            { backgroundColor: active ? 'rgba(255,255,255,0.25)' : c.dangerBg },
          ]}>
          <Text style={[styles.tabCountText, { color: active ? '#fff' : c.danger }]}>
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Mismatch card ─────────────────────────────────────────────
function MismatchCard({
  item,
  busyId,
  onReconcile,
}: {
  item: Mismatch;
  busyId: number | null;
  onReconcile: (id: number) => void;
}) {
  const c = useTheme();
  return (
    <View style={[styles.accentCard, { borderLeftColor: c.warning, backgroundColor: c.surface, borderColor: c.border }]}>
      {/* Header */}
      <View style={styles.cardTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: c.text }]} numberOfLines={1}>
            {item.counterparty_name}
          </Text>
          <Text style={[styles.cardMeta, { color: c.textMuted }]}>
            Tx #{item.id} · {item.transaction_date}
          </Text>
        </View>
        <Badge
          label={item.direction}
          variant={item.direction === 'PAYABLE' ? 'danger' : 'info'}
        />
      </View>

      {/* Amount */}
      <Text style={[styles.cardAmount, { color: c.text }]}>{kes(item.amount)}</Text>

      {/* Notes */}
      {item.notes ? (
        <Text style={[styles.notesText, { color: c.textMuted }]}>{item.notes}</Text>
      ) : null}

      <SecondaryButton
        label={busyId === item.id ? 'Running…' : 'Run Reconcile'}
        onPress={() => onReconcile(item.id)}
        disabled={busyId != null}
        icon={<Ionicons name="git-compare-outline" size={14} color={c.tint} />}
      />
    </View>
  );
}

// ── Draft card with SMS bubble ────────────────────────────────
function DraftCard({
  item,
  busyId,
  onApprove,
}: {
  item: Draft;
  busyId: number | null;
  onApprove: (id: number) => void;
}) {
  const c = useTheme();
  return (
    <Card>
      {/* Header */}
      <View style={styles.cardTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: c.text }]} numberOfLines={1}>
            {item.counterparty_name}
          </Text>
          <Text style={[styles.cardMeta, { color: c.textMuted }]}>
            Tx #{item.transaction_id} · {kes(item.amount)}
          </Text>
        </View>
        <Badge
          label={item.draft_type === 'reminder' ? 'Reminder' : 'Confirmation'}
          variant={item.draft_type === 'reminder' ? 'warning' : 'success'}
        />
      </View>

      {/* SMS bubble preview */}
      <View style={[styles.smsBubble, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}>
        <View style={styles.smsBubbleHeader}>
          <Ionicons name="chatbubble-outline" size={12} color={c.textMuted} />
          <Text style={[styles.smsBubbleLabel, { color: c.textMuted }]}>SMS Preview</Text>
        </View>
        <Text style={[styles.smsText, { color: c.text }]}>{item.message_text}</Text>
      </View>

      {/* Approve CTA — highest visual priority */}
      <PrimaryButton
        label={busyId === item.id ? 'Sending…' : 'Approve & Send SMS'}
        onPress={() => onApprove(item.id)}
        disabled={busyId != null}
        icon={<Ionicons name="send" size={15} color={c.textOnPrimary} />}
      />
    </Card>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function InboxScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [data, setData] = useState<InboxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'mismatches' | 'drafts'>('mismatches');

  useEffect(() => {
    if (params.tab === 'drafts' || params.tab === 'mismatches') {
      setActiveTab(params.tab);
    }
  }, [params.tab]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.inbox());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inbox');
    } finally {
      setLoading(false);
    }
  }, []);

  const generateReport = () => {
    const mismatchesList = data?.mismatches ?? [];
    const draftsList = data?.pending_drafts ?? [];
    const actionPoints = [
      ...mismatchesList.map((m) => ({
        retailer: m.counterparty_name,
        issue: 'Open payment or invoice mismatch',
        amount: m.amount,
        action: 'Review transaction ledger line items and verify reconciliation flags.',
      })),
      ...draftsList.map((d) => ({
        retailer: d.counterparty_name,
        issue: 'SMS Notification reminder pending approval',
        amount: d.amount,
        action: "Approve draft message to notify retailer over Africa's Talking network.",
      })),
    ];

    if (actionPoints.length === 0) {
      Alert.alert('No Action Items', 'Your wholesale ledger is clean. No action report needed.');
      return;
    }

    const html = `
      <html>
        <head>
          <title>Mizani Ledger Actions Report</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #222; }
            h1 { font-size: 24px; font-weight: bold; margin-bottom: 5px; color: #1B4332; }
            p.subtitle { font-size: 14px; color: #666; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px 15px; text-align: left; }
            th { background-color: #1B4332; color: white; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            td.amount { font-weight: bold; text-align: right; }
            .footer { margin-top: 50px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 15px; }
          </style>
        </head>
        <body>
          <h1>Mizani — Wholesaler Action Plan Report</h1>
          <p class="subtitle">Generated: ${new Date().toLocaleString()} · Local Ledger Database</p>
          
          <table>
            <thead>
              <tr>
                <th>Retailer / Counterparty</th>
                 <th>Ledger Status Issue</th>
                 <th>Outstanding Amount</th>
                 <th>Corrective Action</th>
              </tr>
            </thead>
            <tbody>
              ${actionPoints.map((ap) => `
                <tr>
                  <td><strong>${ap.retailer}</strong></td>
                  <td>${ap.issue}</td>
                  <td class="amount">KES ${ap.amount.toLocaleString()}</td>
                  <td>${ap.action}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            Mizani Ledger Systems · Kenya Wholesalers Group · Built with Gemma 4 AI
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    if (Platform.OS === 'web') {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
      }
    } else {
      Alert.alert('Report Generated', `Compiled ${actionPoints.length} action items. Print format is supported in web browser mode.`);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const onReconcile = async (transactionId: number) => {
    setBusyId(transactionId);
    try {
      const result = await api.reconcile(transactionId);
      const automation = result.automation as
        | { draft_ready?: boolean; message?: string }
        | undefined;
      const reconciliationMessage = result.discrepancy_notes
        ? String(result.discrepancy_notes)
        : `Status: ${result.status}`;
      Alert.alert(
        'Reconcile',
        automation?.message
          ? `${reconciliationMessage}\n\n${automation.message}`
          : reconciliationMessage,
      );
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Reconcile failed');
    } finally {
      setBusyId(null);
    }
  };

  const onApprove = async (draftId: number) => {
    setBusyId(draftId);
    try {
      const result = await api.approveDraft(draftId);
      Alert.alert(
        'Approved',
        result.sms_sent ? 'Draft approved and SMS sent (sandbox).' : 'Draft approved.',
      );
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) {
    return (
      <Screen>
        <Loading label="Loading inbox…" />
      </Screen>
    );
  }

  const mismatches = data?.mismatches ?? [];
  const drafts     = data?.pending_drafts ?? [];
  const totalFlags = mismatches.length + drafts.length;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.pad}>

        {/* Header */}
        <Text style={[styles.pageTitle, { color: c.text }]}>Inbox</Text>
        <Muted>Mismatches and drafts awaiting your approval</Muted>

        {totalFlags > 0 && (
          <SecondaryButton
            label="Generate Action Report"
            onPress={generateReport}
            style={{ marginTop: 12, marginBottom: 4 }}
            icon={<Ionicons name="print-outline" size={15} color={c.tint} />}
          />
        )}

        {error ? <ErrorText message={error} /> : null}

        {/* Toggle tabs */}
        <View style={styles.tabRow}>
          <TabPill
            label="Mismatches"
            count={mismatches.length}
            active={activeTab === 'mismatches'}
            onPress={() => setActiveTab('mismatches')}
          />
          <TabPill
            label="Drafts"
            count={drafts.length}
            active={activeTab === 'drafts'}
            onPress={() => setActiveTab('drafts')}
          />
        </View>

        {/* Empty state */}
        {totalFlags === 0 ? (
          <Card style={{ marginTop: 8 }}>
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={36} color={c.success} />
              <Text style={[styles.emptyTitle, { color: c.text }]}>All clear</Text>
              <Text style={[styles.emptyBody, { color: c.textMuted }]}>
                No mismatches or pending drafts. Sync M-PESA or upload a statement to generate activity.
              </Text>
            </View>
          </Card>
        ) : null}

        {/* Mismatches tab */}
        {activeTab === 'mismatches' && (
          <View style={{ marginTop: 8 }}>
            {mismatches.length === 0 ? (
              <Card>
                <View style={styles.tabEmpty}>
                  <Ionicons name="checkmark-done-outline" size={24} color={c.success} />
                  <Text style={[styles.tabEmptyText, { color: c.textMuted }]}>
                    No open mismatches
                  </Text>
                </View>
              </Card>
            ) : (
              mismatches.map((m) => (
                <MismatchCard
                  key={m.id}
                  item={m}
                  busyId={busyId}
                  onReconcile={onReconcile}
                />
              ))
            )}
          </View>
        )}

        {/* Drafts tab */}
        {activeTab === 'drafts' && (
          <View style={{ marginTop: 8 }}>
            {drafts.length === 0 ? (
              <Card>
                <View style={styles.tabEmpty}>
                  <Ionicons name="mail-outline" size={24} color={c.textMuted} />
                  <Text style={[styles.tabEmptyText, { color: c.textMuted }]}>
                    No pending drafts. Open a matched receivable via the API to generate one.
                  </Text>
                </View>
              </Card>
            ) : (
              drafts.map((d) => (
                <DraftCard
                  key={d.id}
                  item={d}
                  busyId={busyId}
                  onApprove={onApprove}
                />
              ))
            )}
          </View>
        )}

      </ScrollView>
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
  // Tab pills
  tabRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    marginBottom: 4,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
  tabCount: {
    borderRadius: 100,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  tabCountText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  // Mismatch accent card
  accentCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  cardName: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
  cardMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  cardAmount: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
    marginBottom: 8,
  },
  notesText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    marginBottom: 8,
  },
  // SMS bubble
  smsBubble: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginVertical: 12,
    gap: 8,
  },
  smsBubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  smsBubbleLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  smsText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  // Empty states
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  tabEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  tabEmptyText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
});
