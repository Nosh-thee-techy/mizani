/**
 * Mizizi — full-bleed voice co-helper screen.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMiziziVoice } from '@/hooks/useMiziziVoice';

const MIZIZI_FULL = require('@/assets/images/mizizi-full.png');
const { height: SCREEN_H } = Dimensions.get('window');

const STARTERS = [
  'My sales today',
  'Who owes me money?',
  'Who should get goods today?',
];

const STATUS_COPY = {
  idle: ['Mizizi', 'Your business co-helper · ask by voice or text'],
  connecting: ['Mizizi', 'Getting ready…'],
  listening: ['Ninakusikiliza', 'Speak in English, Kiswahili, or Sheng'],
  thinking: ['Mizizi', 'Checking your books…'],
  speaking: ['Mizizi', 'Speaking · tap interrupt anytime'],
  error: ['Mizizi', 'Type below — voice needs an Android build'],
} as const;

export default function MiziziScreen() {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [showChat, setShowChat] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const voice = useMiziziVoice();
  const [title, subtitle] = STATUS_COPY[voice.status];
  const hasMessages = voice.messages.length > 0;

  useEffect(() => {
    if (hasMessages) setShowChat(true);
  }, [hasMessages]);

  useEffect(() => {
    if (showChat && voice.messages.length) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }, [voice.messages, showChat]);

  const submit = async (value = draft) => {
    if (!value.trim()) return;
    setDraft('');
    setShowChat(true);
    await voice.sendText(value);
  };

  return (
    <View style={styles.root}>
      <ImageBackground
        source={MIZIZI_FULL}
        style={styles.fullBleed}
        resizeMode="cover"
        accessibilityRole="image"
        accessibilityLabel={`Mizizi, ${voice.status}`}>
        {/* Soft vignette so face stays clear while controls read */}
        <LinearGradient
          colors={[
            'rgba(10,28,20,0.35)',
            'rgba(10,28,20,0.05)',
            'rgba(10,28,20,0.15)',
            'rgba(8,20,14,0.92)',
          ]}
          locations={[0, 0.28, 0.52, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Pulse ring when listening / speaking */}
        {(voice.status === 'listening' || voice.status === 'speaking') && (
          <View
            pointerEvents="none"
            style={[
              styles.pulseRing,
              {
                borderColor:
                  voice.status === 'speaking'
                    ? 'rgba(245,158,11,0.55)'
                    : 'rgba(61,184,138,0.5)',
                transform: [{ scale: 1 + voice.inputLevel * 0.08 }],
              },
            ]}
          />
        )}

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.glassBtn, { opacity: pressed ? 0.75 : 1 }]}
              accessibilityLabel="Close Mizizi">
              <Ionicons name="chevron-down" size={22} color="#FFFDF8" />
            </Pressable>
            <View style={styles.livePill}>
              <View
                style={[
                  styles.liveDot,
                  {
                    backgroundColor:
                      voice.status === 'error'
                        ? '#F97066'
                        : voice.isActive
                          ? '#32D583'
                          : '#F59E0B',
                  },
                ]}
              />
              <Text style={styles.liveText}>Gemini Live</Text>
            </View>
            <Pressable
              onPress={() => {
                voice.clearMessages();
                setShowChat(false);
              }}
              style={({ pressed }) => [styles.glassBtn, { opacity: pressed ? 0.75 : 1 }]}
              accessibilityLabel="Clear conversation">
              <Ionicons name="refresh-outline" size={20} color="#FFFDF8" />
            </Pressable>
          </View>

          {/* Spacer keeps her portrait as the main composition */}
          <View style={styles.portraitSpace} />

          <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <Text style={styles.brandTitle}>{title}</Text>
            <Text style={styles.brandSub}>{voice.toolActivity || subtitle}</Text>

            {voice.error ? (
              <Text style={styles.errorLine} numberOfLines={2}>
                {voice.error}
              </Text>
            ) : null}

            <Pressable
              onPress={() => {
                if (voice.status === 'speaking') void voice.interrupt();
                else if (voice.isActive) void voice.disconnect();
                else void voice.connect();
              }}
              style={({ pressed }) => [
                styles.talkBtn,
                {
                  backgroundColor:
                    voice.isActive && voice.status !== 'speaking' ? '#B42318' : '#FFFDF8',
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                voice.isActive ? 'End voice conversation' : 'Start voice conversation'
              }>
              <Ionicons
                name={
                  voice.status === 'speaking'
                    ? 'hand-left-outline'
                    : voice.isActive
                      ? 'stop'
                      : 'mic'
                }
                size={22}
                color={voice.isActive && voice.status !== 'speaking' ? '#FFF' : '#0F6B4C'}
              />
              <Text
                style={[
                  styles.talkText,
                  {
                    color:
                      voice.isActive && voice.status !== 'speaking' ? '#FFF' : '#0F6B4C',
                  },
                ]}>
                {voice.status === 'speaking'
                  ? 'Interrupt'
                  : voice.isActive
                    ? 'End conversation'
                    : 'Talk to Mizizi'}
              </Text>
            </Pressable>

            {!showChat && !hasMessages ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.starterRow}
                keyboardShouldPersistTaps="handled">
                {STARTERS.map((starter) => (
                  <Pressable
                    key={starter}
                    onPress={() => void submit(starter)}
                    style={({ pressed }) => [
                      styles.starterChip,
                      { opacity: pressed ? 0.8 : 1 },
                    ]}>
                    <Text style={styles.starterChipText} numberOfLines={1}>
                      {starter}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Pressable onPress={() => setShowChat((v) => !v)} style={styles.toggleChat}>
                <Text style={styles.toggleChatText}>
                  {showChat ? 'Hide chat' : 'Show chat'}
                </Text>
              </Pressable>
            )}

            {showChat ? (
              <ScrollView
                ref={scrollRef}
                style={styles.chatPane}
                contentContainerStyle={styles.chatContent}
                keyboardShouldPersistTaps="handled">
                {voice.messages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.bubble,
                      message.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                    ]}>
                    <Text
                      style={[
                        styles.bubbleText,
                        { color: message.role === 'user' ? '#FFFDF8' : '#F3EEE4' },
                      ]}>
                      {message.text}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            <View style={styles.composer}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => void submit()}
                placeholder="Type to Mizizi…"
                placeholderTextColor="rgba(255,253,248,0.45)"
                style={styles.input}
                returnKeyType="send"
                accessibilityLabel="Message Mizizi"
              />
              <Pressable
                onPress={() => void submit()}
                disabled={!draft.trim()}
                style={[
                  styles.send,
                  { backgroundColor: draft.trim() ? '#3DB88A' : 'rgba(255,253,248,0.2)' },
                ]}
                accessibilityLabel="Send message">
                <Ionicons name="arrow-up" size={18} color="#FFF" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A1C14' },
  flex: { flex: 1 },
  fullBleed: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  topBar: {
    paddingHorizontal: 14,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  glassBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: {
    color: '#FFFDF8',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
  portraitSpace: {
    flex: 1,
    minHeight: SCREEN_H * 0.38,
  },
  pulseRing: {
    position: 'absolute',
    alignSelf: 'center',
    top: '22%',
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 2,
  },
  dock: {
    paddingHorizontal: 18,
    gap: 8,
  },
  brandTitle: {
    color: '#FFFDF8',
    fontSize: 34,
    lineHeight: 38,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.8,
  },
  brandSub: {
    color: 'rgba(255,253,248,0.78)',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
    marginBottom: 4,
  },
  errorLine: {
    color: '#FDB022',
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Inter_500Medium',
  },
  talkBtn: {
    minHeight: 52,
    borderRadius: 26,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    alignSelf: 'stretch',
  },
  talkText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  starterRow: { gap: 8, paddingVertical: 4 },
  starterChip: {
    maxWidth: 220,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,253,248,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,253,248,0.22)',
    marginRight: 8,
  },
  starterChipText: {
    color: '#FFFDF8',
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  toggleChat: { alignSelf: 'flex-start', paddingVertical: 4 },
  toggleChatText: {
    color: 'rgba(255,253,248,0.7)',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  chatPane: {
    maxHeight: 150,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  chatContent: { padding: 10, gap: 8 },
  bubble: {
    maxWidth: '88%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(15,107,76,0.9)',
  },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,253,248,0.12)',
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  input: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,253,248,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,253,248,0.18)',
    color: '#FFFDF8',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
