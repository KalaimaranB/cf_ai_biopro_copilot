import { useEffect, useRef } from 'react';
import { THEME, Icons } from '../theme';
import type { Message } from '../types';

interface ChatProps {
  messages: Message[];
  liveTranscript: string;
  isLoading: boolean;
  isListening: boolean;
  onStart: () => void;
  onStop: () => void;
  mode: 'general' | 'notebook';
}

export default function ChatSidebar({ messages, liveTranscript, isLoading, isListening, onStart, onStop, mode }: ChatProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => { 
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages, liveTranscript]);

  return (
    <div style={{ flex: mode === 'notebook' ? '0 0 35%' : '1', minWidth: '350px', display: 'flex', flexDirection: 'column', borderRight: mode === 'notebook' ? `1px solid ${THEME.BORDER}` : 'none', backgroundColor: THEME.BG_DARKEST, transition: 'all 0.3s ease' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {messages.length === 0 && !liveTranscript && (
          <div style={{ margin: 'auto', textAlign: 'center', color: THEME.FG_SECONDARY }}>
            <Icons.Mic />
            <p style={{ marginTop: '12px', fontSize: '0.95rem' }}>Awaiting acoustic input.</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <span style={{ fontSize: '0.7rem', color: THEME.FG_SECONDARY }}>{msg.role === 'user' ? 'Researcher' : 'Copilot'}</span>
            <div style={{ backgroundColor: msg.role === 'user' ? THEME.ACCENT_PRIMARY : THEME.BG_MEDIUM, color: THEME.FG_PRIMARY, padding: '12px 16px', borderRadius: '8px', border: msg.role === 'user' ? 'none' : `1px solid ${THEME.BORDER}`, fontSize: '0.9rem', lineHeight: '1.5' }}>
              {msg.content}
            </div>
          </div>
        ))}
        {liveTranscript && <div style={{ alignSelf: 'flex-end', backgroundColor: THEME.BG_LIGHT, padding: '10px 14px', borderRadius: '8px', fontStyle: 'italic', fontSize: '0.9rem' }}>{liveTranscript}...</div>}
        {isLoading && <div style={{ color: THEME.FG_SECONDARY, fontSize: '0.85rem' }}>Processing telemetry...</div>}
        <div ref={chatEndRef} />
      </div>
      
      <div style={{ padding: '20px', backgroundColor: THEME.BG_DARK, borderTop: `1px solid ${THEME.BORDER}`, display: 'flex', justifyContent: 'center' }}>
        <button onClick={isListening ? onStop : onStart} disabled={isLoading} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: isListening ? THEME.ACCENT_DANGER : THEME.ACCENT_PRIMARY, color: '#FFF', padding: '12px 24px', fontSize: '1rem', border: 'none', borderRadius: '6px', cursor: isLoading ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
          {isListening ? <><Icons.Stop /> Terminate & Process</> : <><Icons.Mic /> Initialize Voice Command</>}
        </button>
      </div>
    </div>
  );
}