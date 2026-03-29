export type Role = 'user' | 'assistant';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
  thoughts?: string[];
  sources?: { id: number; title: string; url?: string; text?: string }[];
}