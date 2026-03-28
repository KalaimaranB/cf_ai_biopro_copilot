export type Role = 'user' | 'assistant';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[]; 
}