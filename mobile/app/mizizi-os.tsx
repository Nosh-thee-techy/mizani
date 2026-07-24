/**
 * Mizizi OS — WhatsApp simulation for cash-control agent demos.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen, useTheme } from '@/components/Ui';
import { api, kes } from '@/lib/api';

const AVATAR = require('@/assets/images/mizizi-avatar.png');

type ChatBubble = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  card?: string;
  data?: Record<string, any>;
};

const QUICK = [
  'My sales today',
  'Who owes me money?',
  'Who should get goods today?',
  'Any overdue customers?',
  'Can this buyer get more credit?',
];

function DataCard({
  card,
  data,
}: {
  card?: string;
  data?: Record<string, any>;
}) {
  const c = useTheme();
  if (!card || !data) return null;

  if (card === 'crisis') {
    return (
      <View style={[styles.card, { backgroundColor: '#FFFDF8', borderColor: '#D1D7DB' }]}>
        <Text style={[styles.cardTitle, { color: c.danger }]}>Who owes you</Text>
        <Text style={styles.cardLine}>{data.headline}</Text>
        <Text style={styles.cardMeta}>
          Open {kes(data.open_receivables || 0)} · 30+ {kes(data.overdue_30_plus || 0)}
        </Text>
        {(data.top_debtors || []).slice(0, 3).map((d: any) => (
          <Text key={d.name} style={styles.cardBullet}>
            • {d.name}: {kes(d.open_amount)} ({d.oldest_days}d)
          </Text>
        ))}
      </View>
    );
  }

  if (card === 'sales') {
    const week = data.week || {};
    return (
      <View style={[styles.card, { backgroundColor: '#FFFDF8', borderColor: '#D1D7DB' }]}>
        <Text style={[styles.cardTitle, { color: c.tint }]}>Sales snapshot</Text>
        <Text style={styles.cardLine}>
          Today in {kes(data.period_receivables || 0)} · out {kes(data.period_payables || 0)}
        </Text>
        <Text style={styles.cardMeta}>
          7d in {kes(week.period_receivables || 0)} · customers still owe{' '}
          {kes(data.owed_to_wholesaler || 0)}
        </Text>
      </View>
    );
  }

  if (card === 'goods') {
    const rows = data.deliveries || [];
    return (
      <View style={[styles.card, { backgroundColor: '#FFFDF8', borderColor: '#D1D7DB' }]}>
        <Text style={[styles.cardTitle, { color: c.accent }]}>Goods / deliveries</Text>
        {rows.length === 0 ? (
          <Text style={styles.cardLine}>No pending deliveries right now.</Text>
        ) : (
          rows.slice(0, 4).map((d: any) => (
            <Text key={`${d.id}-${d.counterparty_name}`} style={styles.cardBullet}>
              • {d.counterparty_name}: {d.match_status}
            </Text>
          ))
        )}
      </View>
    );
  }

  if (card === 'trust') {
    return (
      <View style={[styles.card, { backgroundColor: '#FFFDF8', borderColor: '#D1D7DB' }]}>
        <Text style={[styles.cardTitle, { color: c.tint }]}>Buyer Trust Scores</Text>
        {(data.buyers || []).slice(0, 4).map((b: any) => (
          <Text key={b.name} style={styles.cardBullet}>
            • {b.name}: {b.trust_score}/100 ({b.band})
            {b.credit_hold ? ' · HOLD' : ''}
          </Text>
        ))}
      </View>
    );
  }

  if (card === 'credit') {
    return (
      <View style={[styles.card, { backgroundColor: '#FFFDF8', borderColor: '#D1D7DB' }]}>
        <Text style={[styles.cardTitle, { color: data.soft_block ? c.danger : c.success }]}>
          Credit Control · {data.soft_block ? 'SOFT BLOCK' : 'ALLOWED'}
        </Text>
        <Text style={styles.cardLine}>{data.reason}</Text>
      </View>
    );
  }

  if (card === 'financing') {
    const s = data.summary || {};
    return (
      <View style={[styles.card, { backgroundColor: '#FFFDF8', borderColor: '#D1D7DB' }]}>
        <Text style={[styles.cardTitle, { color: c.gold }]}>Financing Pack</Text>
        <Text style={styles.cardLine}>Readiness {data.readiness_score}/100</Text>
        <Text style={styles.cardMeta}>
          Eligible ~ {kes(s.eligible_collateral_estimate || 0)}
        </Text>
        <Text style={styles.cardMeta}>
          Open {kes(s.open_receivables || 0)} · High-risk buyers {s.high_risk_buyers || 0}
        </Text>
      </View>
    );
  }

  return null;
}

export default function MiziziOsScreen() {
  const c = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(QUICK);
  const [messages, setMessages] = useState<ChatBubble[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text:
        'Habari 👋 I’m *Mizizi OS* on WhatsApp simulation.\n\n' +
        'Ask like a wholesaler — sales, who owes you, who gets stock today, credit holds.\n\n' +
        'Try: “Who owes me money?”',
    },
  ]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages, loading]);

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || loading) return;
    setDraft('');
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-u`, role: 'user', text: clean },
    ]);
    setLoading(true);
    try {
      const res = await api.miziziOsChat(clean);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: 'assistant',
          text: res.reply,
          card: res.card,
          data: res.data,
        },
      ]);
      if (res.suggestions?.length) setSuggestions(res.suggestions);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          role: 'assistant',
          text:
            e instanceof Error
              ? `Pole — ${e.message}`
              : 'Pole — could not reach Mizizi OS. Is the API running?',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen style={{ backgroundColor: '#0B141A' }}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* WhatsApp-like header */}
        <LinearGradient colors={['#1F2C34', '#0B141A']} style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.headerBtn}
            accessibilityLabel="Close Mizizi OS">
            <Ionicons name="arrow-back" size={22} color="#E9EDEF" />
          </Pressable>
          <Image source={AVATAR} style={styles.headerAvatar} />
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Mizizi OS</Text>
            <Text style={styles.headerSub}>online · WhatsApp simulation</Text>
          </View>
          <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
        </LinearGradient>

        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          keyboardShouldPersistTaps="handled">
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.row,
                msg.role === 'user' ? styles.rowUser : styles.rowAssistant,
              ]}>
              <View
                style={[
                  styles.bubble,
                  msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                ]}>
                <Text
                  style={[
                    styles.bubbleText,
                    { color: msg.role === 'user' ? '#E9EDEF' : '#111B21' },
                  ]}>
                  {msg.text}
                </Text>
                {msg.role === 'assistant' ? (
                  <DataCard card={msg.card} data={msg.data} />
                ) : null}
              </View>
            </View>
          ))}
          {loading ? (
            <View style={styles.rowAssistant}>
              <View style={[styles.bubble, styles.bubbleAssistant]}>
                <Text style={[styles.bubbleText, { color: '#667781' }]}>
                  Mizizi OS is checking your books…
                </Text>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.chipsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
            style={styles.chipsScroll}>
            {suggestions.map((s) => (
              <Pressable
                key={s}
                onPress={() => void send(s)}
                style={({ pressed }) => [
                  styles.chip,
                  { opacity: pressed ? 0.75 : 1 },
                ]}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message Mizizi OS"
            placeholderTextColor="#8696A0"
            style={styles.input}
            onSubmitEditing={() => void send(draft)}
            returnKeyType="send"
          />
          <Pressable
            onPress={() => void send(draft)}
            disabled={!draft.trim() || loading}
            style={[
              styles.send,
              { backgroundColor: draft.trim() ? '#00A884' : '#2A3942' },
            ]}
            accessibilityLabel="Send WhatsApp simulation message">
            <Ionicons name="send" size={18} color="#FFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerCopy: { flex: 1 },
  headerTitle: {
    color: '#E9EDEF',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  headerSub: {
    color: '#8696A0',
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  thread: { flex: 1, backgroundColor: '#0B141A' },
  threadContent: {
    padding: 12,
    paddingBottom: 20,
    gap: 2,
  },
  row: { marginBottom: 8, flexDirection: 'row' },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '86%',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleUser: {
    backgroundColor: '#005C4B',
    borderTopRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
  },
  card: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 3,
  },
  cardTitle: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    marginBottom: 2,
  },
  cardLine: {
    fontSize: 12,
    lineHeight: 17,
    color: '#111B21',
    fontFamily: 'Inter_500Medium',
  },
  cardMeta: {
    fontSize: 11,
    color: '#667781',
    fontFamily: 'Inter_400Regular',
  },
  cardBullet: {
    fontSize: 12,
    color: '#111B21',
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  chipsWrap: {
    height: 40,
    marginBottom: 6,
  },
  chipsScroll: {
    flexGrow: 0,
    height: 40,
  },
  chips: {
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
  },
  chip: {
    height: 32,
    borderWidth: 1,
    borderColor: '#2A3942',
    borderRadius: 16,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: '#1F2C34',
    marginRight: 6,
    maxWidth: 200,
  },
  chipText: {
    color: '#E9EDEF',
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
    backgroundColor: '#1F2C34',
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    backgroundColor: '#2A3942',
    color: '#E9EDEF',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
