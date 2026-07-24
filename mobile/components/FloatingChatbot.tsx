/**
 * Mizani Floating AI Chatbot Assistant component.
 * Allows wholesaler to chat with Gemma 4 about their business metrics.
 */

import { Ionicons } from '@expo/vector-icons';
import { useState, useRef } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { useTheme } from '@/components/Ui';
import { api } from '@/lib/api';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export default function FloatingChatbot() {
  const c = useTheme();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([
    'What are my top customer balances?',
    'How much do I owe suppliers?',
    'Are there any delivery gaps today?',
  ]);
  const [loading, setLoading] = useState(false);
  const [expandedIndices, setExpandedIndices] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<ScrollView>(null);

  const onSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMsg = textToSend.trim();
    const updatedHistory: ChatMessage[] = [...history, { role: 'user', content: userMsg }];
    
    setHistory(updatedHistory);
    setMessage('');
    setLoading(true);
    
    // Auto-scroll to bottom
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const res = await api.chat(userMsg, history);
      setHistory([...updatedHistory, { role: 'assistant', content: res.reply }]);
      if (res.suggestions && res.suggestions.length > 0) {
        setSuggestions(res.suggestions);
      }
    } catch (e) {
      setHistory([
        ...updatedHistory,
        { role: 'assistant', content: 'Pole sana, I was unable to connect to Gemma.' },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const clearChat = () => {
    setHistory([]);
    setSuggestions([
      'What are my top customer balances?',
      'How much do I owe suppliers?',
      'Are there any delivery gaps today?',
    ]);
  };

  return (
    <>
      {/* ── FLOATING ACTION BUTTON (FAB) ────────────────────────── */}
      <Pressable
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: c.tint,
            opacity: pressed ? 0.85 : 1,
            shadowColor: c.shadow,
          },
        ]}>
        <Ionicons name="logo-electron" size={24} color="#FFFDF8" />
      </Pressable>

      {/* ── CHAT PANEL MODAL ────────────────────────────────────── */}
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: c.scrim }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.chatContainer, { backgroundColor: c.surface, borderColor: c.border }]}>
            
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: c.border }]}>
              <View style={styles.headerLeft}>
                <View style={[styles.sparkleWrap, { backgroundColor: c.tint + '18' }]}>
                  <Ionicons name="logo-electron" size={18} color={c.tint} />
                </View>
                <View>
                  <Text style={[styles.headerTitle, { color: c.text }]}>Mizani AI</Text>
                  <Text style={[styles.headerSub, { color: c.textMuted }]}>Gemma 4 Wholesaler Guide</Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                <Pressable onPress={clearChat} style={styles.headerBtn}>
                  <Ionicons name="trash-outline" size={20} color={c.textMuted} />
                </Pressable>
                <Pressable onPress={() => setVisible(false)} style={styles.headerBtn}>
                  <Ionicons name="close" size={24} color={c.text} />
                </Pressable>
              </View>
            </View>

            {/* Conversation list */}
            <ScrollView
              ref={scrollRef}
              style={styles.msgScroll}
              contentContainerStyle={styles.msgContent}>
              {history.length === 0 && (
                <View style={styles.welcomeContainer}>
                  <Ionicons name="chatbubbles-outline" size={48} color={c.textMuted} />
                  <Text style={[styles.welcomeTitle, { color: c.text }]}>Uliza Gemma</Text>
                  <Text style={[styles.welcomeText, { color: c.textMuted }]}>
                    Ask questions about your ledger invoices, supplier debts, cash flows, or delivery mismatches in plain Swahili/English.
                  </Text>
                </View>
              )}

              {history.map((msg, idx) => {
                const isExpanded = !!expandedIndices[idx];
                const isLong = msg.content.length > 120;
                const displayText =
                  !isExpanded && isLong && msg.role === 'assistant'
                    ? `${msg.content.slice(0, 110)}...`
                    : msg.content;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.msgBubbleWrap,
                      msg.role === 'user' ? styles.msgUser : styles.msgAssistant,
                    ]}>
                    <Pressable
                      onPress={() => {
                        if (isLong) {
                          setExpandedIndices((prev) => ({
                            ...prev,
                            [idx]: !prev[idx],
                          }));
                        }
                      }}
                      style={({ pressed }) => [
                        styles.msgBubble,
                        {
                          backgroundColor: msg.role === 'user' ? c.tint : c.surfaceElevated,
                          borderColor: c.border,
                          opacity: isLong && pressed ? 0.85 : 1,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.msgText,
                          { color: msg.role === 'user' ? '#FFF' : c.text },
                        ]}>
                        {displayText}
                      </Text>
                      {isLong && msg.role === 'assistant' && (
                        <Text
                          style={{
                            fontSize: 11,
                            fontFamily: 'Inter_600SemiBold',
                            color: c.tint,
                            marginTop: 6,
                          }}>
                          {isExpanded ? 'Collapse analysis' : 'Tap to expand full details'}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}

              {loading && (
                <View style={styles.msgAssistant}>
                  <View style={[styles.msgBubble, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}>
                    <Text style={[styles.msgText, { color: c.text }]}>Thinking...</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Suggestions list */}
            {suggestions.length > 0 && (
              <View style={styles.suggestionSection}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sugScroll}>
                  {suggestions.map((sug, idx) => (
                    <Pressable
                      key={idx}
                      onPress={() => onSend(sug)}
                      style={[styles.sugPill, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}>
                      <Text style={[styles.sugLabel, { color: c.tint }]}>{sug}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Input bar */}
            <View style={[styles.inputBar, { borderTopColor: c.border, backgroundColor: c.surface }]}>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Ask Gemma about your books..."
                placeholderTextColor={c.textMuted}
                style={[styles.chatInput, { borderColor: c.border, color: c.text, backgroundColor: c.surfaceElevated }]}
                onSubmitEditing={() => onSend(message)}
              />
              <Pressable
                onPress={() => onSend(message)}
                disabled={!message.trim() || loading}
                style={[
                  styles.sendBtn,
                  { backgroundColor: message.trim() ? c.tint : c.border },
                ]}>
                <Ionicons name="send" size={16} color="#FFFDF8" />
              </Pressable>
            </View>

          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 90, // overlay above tab bar
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    zIndex: 9999,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  chatContainer: {
    height: '75%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sparkleWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  headerSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBtn: {
    padding: 6,
  },
  msgScroll: {
    flex: 1,
  },
  msgContent: {
    padding: 16,
    paddingBottom: 24,
  },
  welcomeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 12,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  welcomeText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  msgBubbleWrap: {
    marginBottom: 12,
    flexDirection: 'row',
    width: '100%',
  },
  msgUser: {
    justifyContent: 'flex-end',
  },
  msgAssistant: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    borderWidth: 0.5,
  },
  msgText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  suggestionSection: {
    paddingVertical: 10,
  },
  sugScroll: {
    paddingHorizontal: 16,
  },
  sugPill: {
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  sugLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  chatInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
