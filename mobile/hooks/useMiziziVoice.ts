import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { api, MIZIZI_VOICE_URL } from '@/lib/api';
import type { MiziziStatus, MiziziVoiceApi, VoiceMessage } from '@/hooks/miziziVoiceTypes';

export type { MiziziStatus, VoiceMessage } from '@/hooks/miziziVoiceTypes';

type AudioModule = {
  ExpoPlayAudioStream: any;
  Pipeline: any;
};

function loadAudioModule(): AudioModule | null {
  try {
    // Native-only package — must not be a static import (breaks web/Expo Go).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@edkimmel/expo-audio-stream') as AudioModule;
  } catch {
    return null;
  }
}

type ServerEvent = {
  type: string;
  data?: string;
  text?: string;
  role?: 'user' | 'assistant';
  message?: string;
  turn_id?: string;
  name?: string;
  state?: string;
};

function appendTranscript(
  messages: VoiceMessage[],
  role: 'user' | 'assistant',
  text: string,
): VoiceMessage[] {
  const clean = text.trim();
  if (!clean) return messages;
  const last = messages[messages.length - 1];
  if (last?.role === role) {
    return [
      ...messages.slice(0, -1),
      { ...last, text: `${last.text}${clean.startsWith(' ') ? '' : ' '}${clean}`.trim() },
    ];
  }
  return [...messages, { id: `${Date.now()}-${messages.length}`, role, text: clean }];
}

export function useMiziziVoice(): MiziziVoiceApi {
  const [status, setStatus] = useState<MiziziStatus>('idle');
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [error, setError] = useState('');
  const [toolActivity, setToolActivity] = useState('');
  const [inputLevel, setInputLevel] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const micSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const activeTurnRef = useRef('');
  const firstChunkRef = useRef(true);
  const intentionalCloseRef = useRef(false);
  const audioRef = useRef<AudioModule | null>(null);

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = loadAudioModule();
    }
    return audioRef.current;
  }, []);

  const stopAudio = useCallback(async () => {
    micSubscriptionRef.current?.remove();
    micSubscriptionRef.current = null;
    const audio = getAudio();
    if (!audio) {
      setInputLevel(0);
      return;
    }
    try {
      await audio.ExpoPlayAudioStream.stopMicrophone();
    } catch {
      // Mic may not have started.
    }
    try {
      await audio.Pipeline.disconnect();
    } catch {
      // Pipeline may already be closed.
    }
    setInputLevel(0);
  }, [getAudio]);

  const disconnect = useCallback(async () => {
    intentionalCloseRef.current = true;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'close' }));
    }
    socket?.close();
    await stopAudio();
    setStatus('idle');
    setToolActivity('');
  }, [stopAudio]);

  const startMicrophone = useCallback(
    async (socket: WebSocket) => {
      const audio = getAudio();
      if (!audio) {
        throw new Error(
          'Native voice module missing. Use an Android development build (`npx expo run:android`).',
        );
      }
      const permission = await audio.ExpoPlayAudioStream.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Microphone permission is required to talk with Mizizi.');
      }
      await audio.Pipeline.connect({
        sampleRate: 24000,
        channelCount: 1,
        targetBufferMs: 80,
        playbackMode: 'conversation',
        audioMode: 'duckOthers',
      });
      const result = await audio.ExpoPlayAudioStream.startMicrophone({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 100,
        frequencyBandConfig: { lowCrossoverHz: 300, highCrossoverHz: 2000 },
        onAudioStream: async (event: { soundLevel?: number; data: string }) => {
          const level = typeof event.soundLevel === 'number' ? event.soundLevel : -60;
          setInputLevel(Math.max(0, Math.min(1, (level + 60) / 60)));
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'audio', data: event.data }));
          }
        },
      });
      micSubscriptionRef.current = result.subscription ?? null;
      setStatus('listening');
    },
    [getAudio],
  );

  const handleServerEvent = useCallback(
    async (event: ServerEvent) => {
      const audio = getAudio();
      switch (event.type) {
        case 'ready':
          if (socketRef.current) await startMicrophone(socketRef.current);
          break;
        case 'transcript':
          if (event.role && event.text) {
            setMessages((current) => appendTranscript(current, event.role!, event.text!));
            setStatus(event.role === 'user' ? 'thinking' : 'speaking');
          }
          break;
        case 'audio': {
          if (!event.data || !event.turn_id || !audio) break;
          if (activeTurnRef.current !== event.turn_id) {
            activeTurnRef.current = event.turn_id;
            firstChunkRef.current = true;
          }
          setStatus('speaking');
          audio.Pipeline.pushAudioSync({
            audio: event.data,
            turnId: event.turn_id,
            isFirstChunk: firstChunkRef.current,
          });
          firstChunkRef.current = false;
          break;
        }
        case 'generation_complete':
          if (event.turn_id && audio) {
            audio.Pipeline.pushAudioSync({
              audio: '',
              turnId: event.turn_id,
              isLastChunk: true,
            });
          }
          break;
        case 'turn_complete':
          setStatus('listening');
          setToolActivity('');
          break;
        case 'interrupted':
          if (activeTurnRef.current && audio) {
            await audio.Pipeline.invalidateTurn({ turnId: activeTurnRef.current });
          }
          setStatus('listening');
          break;
        case 'tool':
          setToolActivity(
            event.state === 'running' ? `Checking ${event.name?.replace(/_/g, ' ')}…` : '',
          );
          if (event.state === 'running') setStatus('thinking');
          break;
        case 'reconnecting':
          setToolActivity('Refreshing the live session…');
          break;
        case 'error':
          throw new Error(event.message || 'Mizizi could not continue the conversation.');
      }
    },
    [getAudio, startMicrophone],
  );

  const connect = useCallback(async () => {
    if (Platform.OS === 'web') {
      setError('Live voice is available in the Android development build. You can still type.');
      setStatus('error');
      return;
    }
    if (!getAudio()) {
      setError(
        'Voice needs a native build with @edkimmel/expo-audio-stream. Run `npx expo run:android`, or type instead.',
      );
      setStatus('error');
      return;
    }
    if (socketRef.current) return;
    setError('');
    setStatus('connecting');
    intentionalCloseRef.current = false;
    const socket = new WebSocket(MIZIZI_VOICE_URL);
    socketRef.current = socket;
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data)) as ServerEvent;
        void handleServerEvent(event).catch(async (reason) => {
          setError(reason instanceof Error ? reason.message : 'Voice playback failed.');
          setStatus('error');
          await stopAudio();
        });
      } catch {
        setError('Mizizi sent an unreadable response.');
        setStatus('error');
      }
    };
    socket.onerror = () => {
      setError('Could not reach Mizizi. Check that the API is running and reachable.');
      setStatus('error');
    };
    socket.onclose = () => {
      socketRef.current = null;
      void stopAudio();
      if (!intentionalCloseRef.current) {
        setStatus('error');
        setError((current) => current || 'The live conversation ended. Tap to reconnect.');
      }
    };
  }, [getAudio, handleServerEvent, stopAudio]);

  const sendText = useCallback(
    async (text: string) => {
      const clean = text.trim();
      const socket = socketRef.current;
      if (!clean) return false;
      setMessages((current) => appendTranscript(current, 'user', clean));
      setStatus('thinking');
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'text', text: clean }));
        return true;
      }
      try {
        const history = messages.map(({ role, text: content }) => ({ role, content }));
        const response = await api.chat(clean, history);
        setMessages((current) => appendTranscript(current, 'assistant', response.reply));
        setStatus('idle');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Mizizi could not answer.');
        setStatus('error');
        return false;
      }
      return true;
    },
    [messages],
  );

  const interrupt = useCallback(async () => {
    const audio = getAudio();
    if (activeTurnRef.current && audio) {
      await audio.Pipeline.invalidateTurn({ turnId: activeTurnRef.current });
    }
    setStatus('listening');
  }, [getAudio]);

  const clearMessages = useCallback(() => setMessages([]), []);

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      socketRef.current?.close();
      void stopAudio();
    };
  }, [stopAudio]);

  return {
    status,
    messages,
    error,
    toolActivity,
    inputLevel,
    isActive: status !== 'idle' && status !== 'error',
    connect,
    disconnect,
    sendText,
    interrupt,
    clearMessages,
  };
}
