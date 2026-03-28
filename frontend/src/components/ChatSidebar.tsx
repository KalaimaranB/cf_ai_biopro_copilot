import { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { THEME, Icons } from '../theme';

interface Source {
  id: number;
  title: string;
  url?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
  sources?: Source[];
}

interface ChatProps {
  messages: Message[];
  liveTranscript: string;
  isLoading: boolean;
  isListening: boolean;
  onStart: () => void;
  onStop: () => void;
  mode: 'general' | 'notebook';
  agentStatus?: string | null;
}

export default function ChatSidebar({ messages, liveTranscript, isLoading, isListening, onStart, onStop, mode, agentStatus }: ChatProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [dots, setDots] = useState('');

  useEffect(() => { 
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages, liveTranscript, isLoading]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      interval = setInterval(() => {
        setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
      }, 400);
    } else {
      setDots('');
    }
    return () => clearInterval(interval);
  }, [isLoading]);

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
          <div key={idx} style={{ marginBottom: '16px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
            
            {/* The Tool Badge */}
            {msg.toolsUsed && msg.toolsUsed.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.toolsUsed.map(tool => (
                  <span key={tool} style={{ fontSize: '0.75rem', padding: '4px 8px', backgroundColor: THEME.BG_LIGHT, color: THEME.DNA_PRIMARY, borderRadius: '4px', border: `1px solid ${THEME.BORDER}` }}>
                    🔬 Consulted: {tool.replace('search_', '').toUpperCase()}
                  </span>
                ))}
              </div>
            )}

            {/* The Message Bubble */}
            <div style={{ display: 'inline-block', padding: '16px', borderRadius: '8px', backgroundColor: msg.role === 'user' ? THEME.ACCENT_PRIMARY : THEME.BG_MEDIUM, color: '#FFF', maxWidth: '95%', fontSize: '0.95rem', lineHeight: '1.6', textAlign: 'left' }}>
              {msg.role === 'user' ? (
                msg.content
              ) : (
                <>
                  {/* THE MARKDOWN FIX: Explicit inline styles block CSS resets */}
                  <ReactMarkdown
                    components={{
                      h3: ({node, ...props}) => <h3 style={{ marginTop: '16px', marginBottom: '8px', fontSize: '1.15rem', fontWeight: 600, color: THEME.FG_PRIMARY }} {...props} />,
                      p: ({node, ...props}) => <p style={{ marginBottom: '12px' }} {...props} />,
                      ul: ({node, ...props}) => <ul style={{ paddingLeft: '24px', marginBottom: '12px', listStyleType: 'disc' }} {...props} />,
                      ol: ({node, ...props}) => <ol style={{ paddingLeft: '24px', marginBottom: '12px', listStyleType: 'decimal' }} {...props} />,
                      li: ({node, ...props}) => <li style={{ marginBottom: '6px' }} {...props} />,
                      strong: ({node, ...props}) => <strong style={{ fontWeight: 700, color: THEME.ACCENT_PRIMARY }} {...props} />,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>

                  {/* MECHANICAL SOURCES (Zero Hallucination) */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid rgba(255,255,255,0.1)` }}>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: THEME.FG_SECONDARY, fontWeight: 600 }}>Verified Sources:</h4>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: THEME.FG_SECONDARY }}>
                        {msg.sources.map(src => (
                          <li key={src.id} style={{ marginBottom: '6px' }}>
                            [{src.id}] {src.url ? <a href={src.url} target="_blank" rel="noreferrer" style={{ color: THEME.DNA_PRIMARY, textDecoration: 'none' }}>{src.title}</a> : src.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div style={{ textAlign: 'left', color: THEME.ACCENT_PRIMARY, fontSize: '0.9rem', fontStyle: 'italic', padding: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
             <Icons.Brain />
             <span>{agentStatus || `Agent is reasoning${dots}`}</span>
          </div>
        )}
        
        {liveTranscript && (
          <div style={{ alignSelf: 'flex-end', backgroundColor: THEME.BG_LIGHT, padding: '10px 14px', borderRadius: '8px', fontStyle: 'italic', fontSize: '0.9rem', color: THEME.FG_PRIMARY }}>
            {liveTranscript}...
          </div>
        )}
        
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