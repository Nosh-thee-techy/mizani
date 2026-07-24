export type MiziziStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

export type VoiceMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

export type MiziziVoiceApi = {
  status: MiziziStatus;
  messages: VoiceMessage[];
  error: string;
  toolActivity: string;
  inputLevel: number;
  isActive: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendText: (text: string) => Promise<boolean>;
  interrupt: () => Promise<void>;
  clearMessages: () => void;
};
