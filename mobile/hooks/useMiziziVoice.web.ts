/**
 * Web stub — native ExpoPlayAudioStream is unavailable in browsers.
 * Text chat still works via /chat/query.
 */
import { useCallback, useState } from 'react';

import { api } from '@/lib/api';
import type { MiziziStatus, MiziziVoiceApi, VoiceMessage } from '@/hooks/miziziVoiceTypes';

export type { MiziziStatus, VoiceMessage } from '@/hooks/miziziVoiceTypes';

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
  const [error, setError] = useState(
    'Live mic needs an Android development build. Type to Mizizi here on web.',
  );
  const [toolActivity] = useState('');
  const [inputLevel] = useState(0);

  const connect = useCallback(async () => {
    setError('Live voice is available in the Android development build. You can still type.');
    setStatus('error');
  }, []);

  const disconnect = useCallback(async () => {
    setStatus('idle');
  }, []);

  const sendText = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return false;
      setMessages((current) => appendTranscript(current, 'user', clean));
      setStatus('thinking');
      setError('');
      try {
        const history = messages.map(({ role, text: content }) => ({ role, content }));
        const response = await api.chat(clean, history);
        setMessages((current) => appendTranscript(current, 'assistant', response.reply));
        setStatus('idle');
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Mizizi could not answer.');
        setStatus('error');
        return false;
      }
    },
    [messages],
  );

  const interrupt = useCallback(async () => {
    setStatus('idle');
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  return {
    status,
    messages,
    error,
    toolActivity,
    inputLevel,
    isActive: false,
    connect,
    disconnect,
    sendText,
    interrupt,
    clearMessages,
  };
}
