import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { THEME } from '../theme';
import { useWhisperRecognition } from '../hooks/useWhisperRecognition';
import AudioWaveform from '../components/AudioWaveform';

const BACKEND_URL = 'https://backend.biopro.workers.dev';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Source {
  id: number;
  title: string;
  url?: string;
  text?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  thoughts?: string[];
  sources?: Source[];
}

interface Log {
  id: string;
  content: string;
  source: string;
  created_at: string;
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

const mdComponents = {
  h3: ({ ...props }) => (
    <h3 style={{ marginTop: 16, marginBottom: 8, fontSize: '1.1rem', fontWeight: 600, color: THEME.FG_PRIMARY }} {...props} />
  ),
  p: ({ ...props }) => <p style={{ marginBottom: 10, lineHeight: 1.7 }} {...props} />,
  ul: ({ ...props }) => <ul style={{ paddingLeft: 20, marginBottom: 10, listStyleType: 'disc' }} {...props} />,
  ol: ({ ...props }) => <ol style={{ paddingLeft: 20, marginBottom: 10 }} {...props} />,
  li: ({ ...props }) => <li style={{ marginBottom: 4 }} {...props} />,
  strong: ({ ...props }) => <strong style={{ fontWeight: 700, color: THEME.DNA_PRIMARY }} {...props} />,
  code: ({ ...props }) => (
    <code style={{ backgroundColor: THEME.BG_LIGHT, padding: '2px 6px', borderRadius: 4, fontSize: '0.88rem', fontFamily: 'monospace' }} {...props} />
  ),
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ThoughtTrail({ thoughts }: { thoughts: string[] }) {
  if (thoughts.length === 0) return null;
  return (
    <div style={{ marginBottom: 12, padding: '10px 14px', backgroundColor: THEME.BG_DARKEST, borderRadius: 6, border: `1px solid ${THEME.BORDER}` }}>
      {thoughts.map((t, i) => (
        <div key={i} style={{ fontSize: '0.8rem', color: THEME.FG_SECONDARY, lineHeight: 1.8 }}>{t}</div>
      ))}
    </div>
  );
}

function SourceDrawer({ source, onClose }: { source: Source; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, width: 420, height: '100vh',
      backgroundColor: THEME.BG_DARK, borderLeft: `1px solid ${THEME.BORDER}`,
      zIndex: 100, display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
      animation: 'slideIn 0.2s ease',
    }}>
      <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>

      <div style={{ padding: '20px 24px', borderBottom: `1px solid ${THEME.BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: THEME.FG_SECONDARY, textTransform: 'uppercase', letterSpacing: 1 }}>
          Source [{source.id}]
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: THEME.FG_SECONDARY, cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
      </div>

      <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: THEME.FG_PRIMARY }}>{source.title}</h3>
        {source.url && (
          <a href={source.url} target="_blank" rel="noreferrer"
            style={{ display: 'inline-block', marginBottom: 16, fontSize: '0.82rem', color: THEME.ACCENT_PRIMARY, textDecoration: 'none' }}>
            Open on PubMed ↗
          </a>
        )}
        <div style={{ fontSize: '0.9rem', lineHeight: 1.8, color: THEME.FG_PRIMARY, backgroundColor: THEME.BG_MEDIUM, padding: 16, borderRadius: 8, border: `1px solid ${THEME.BORDER}`, whiteSpace: 'pre-wrap' }}>
          {source.text || 'Source text not available.'}
        </div>
      </div>
    </div>
  );
}

function CitationBubble({ num, onClick }: { num: number; onClick: () => void }) {
  return (
    <sup
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: '50%',
        backgroundColor: THEME.ACCENT_PRIMARY, color: '#fff',
        fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer',
        marginLeft: 2, verticalAlign: 'super',
        transition: 'background 0.2s',
        userSelect: 'none',
      }}
      title={`View source ${num}`}
    >
      {num}
    </sup>
  );
}

// Render text with clickable [N] citations
function CitedContent({ text, sources, onCiteClick }: {
  text: string;
  sources: Source[];
  onCiteClick: (src: Source) => void;
}) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (match) {
          const num = parseInt(match[1]);
          const src = sources.find(s => s.id === num);
          if (src) return <CitationBubble key={i} num={num} onClick={() => onCiteClick(src)} />;
        }
        // Render remaining text through ReactMarkdown
        return <span key={i}><ReactMarkdown components={mdComponents as any}>{part}</ReactMarkdown></span>;
      })}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActiveExperiment() {
  const { experimentId } = useParams();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingThoughts, setStreamingThoughts] = useState<string[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [streamingSources, setStreamingSources] = useState<Source[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const [logs, setLogs] = useState<Log[]>([]);
  const [newEntry, setNewEntry] = useState('');
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [mode, setMode] = useState<'general' | 'notebook'>('notebook');

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, streamingThoughts]);

  // Load logs
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/logs?experimentId=${experimentId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.logs) setLogs(d.logs); })
      .catch(console.error);
  }, [experimentId]);

  // ── SSE Pipeline ─────────────────────────────────────────────────────────────

  const handleQuery = async (text: string) => {
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsStreaming(true);
    setStreamingThoughts([]);
    setStreamingText('');
    setStreamingSources([]);

    try {
      const res = await fetch(`${BACKEND_URL}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userMessage: text }),
      });

      if (!res.ok || !res.body) throw new Error('Stream failed to open');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalSources: Source[] = [];
      let fullText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);

          if (chunk.startsWith('data: ')) {
            try {
              const event = JSON.parse(chunk.slice(6));

              if (event.type === 'thought') {
                setStreamingThoughts(prev => [...prev, event.data]);
              }

              else if (event.type === 'context_loaded') {
                finalSources = event.data.sources || [];
                setStreamingSources(finalSources);
              }

              else if (event.type === 'text_delta') {
                fullText += event.data;
                setStreamingText(fullText);
              }

              else if (event.type === 'done') {
                const usedSources: Source[] = event.data.sources || finalSources;

                // Attach chunk text to sources for the drawer
                const enrichedSources = usedSources.map((s: Source) => ({
                  ...s,
                  text: s.text || '(Source text not returned in this version)',
                }));

                const assistantMsg: Message = {
                  role: 'assistant',
                  content: fullText,
                  thoughts: [...streamingThoughts],
                  sources: enrichedSources,
                };

                setMessages(prev => [...prev, assistantMsg]);
                setStreamingText('');
                setStreamingThoughts([]);
                setIsStreaming(false);

                // Auto-log to notebook
                if (mode === 'notebook') {
                  const sourceLegend = enrichedSources.length > 0
                    ? '\n\n---\n**Sources:**\n' + enrichedSources.map((s: Source) =>
                        `* [${s.id}] ${s.url ? `[${s.title}](${s.url})` : s.title}`
                      ).join('\n')
                    : '';
                  const logContent = `**Voice Command:** ${text}\n\n**Output:**\n${fullText}${sourceLegend}`;
                  const tempLog: Log = { id: `temp-${Date.now()}`, content: logContent, source: 'copilot', created_at: new Date().toISOString() };
                  setLogs(prev => [...prev, tempLog]);
                  fetch(`${BACKEND_URL}/api/logs?experimentId=${experimentId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ content: logContent, source: 'copilot' }),
                  }).catch(console.error);
                }
              }

              else if (event.type === 'error') {
                setMessages(prev => [...prev, { role: 'assistant', content: event.data.message }]);
                setIsStreaming(false);
              }

            } catch (e) {
              console.error('SSE parse error:', e);
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      console.error('Stream error:', err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection lost. Please try again.' }]);
      setIsStreaming(false);
    }
  };

  const { isListening, isTranscribing, liveTranscript, analyserNode, startMic, stopMic } =
    useWhisperRecognition(handleQuery);

  // ── Manual log ────────────────────────────────────────────────────────────────

  const handleManualLog = async () => {
    if (!newEntry.trim()) return;
    const tempLog: Log = { id: `temp-${Date.now()}`, content: newEntry, source: 'researcher', created_at: new Date().toISOString() };
    setLogs(prev => [...prev, tempLog]);
    setNewEntry('');
    fetch(`${BACKEND_URL}/api/logs?experimentId=${experimentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content: newEntry, source: 'researcher' }),
    }).catch(console.error);
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ padding: '10px 28px', backgroundColor: THEME.BG_MEDIUM, borderBottom: `1px solid ${THEME.BORDER}`, display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: THEME.ACCENT_PRIMARY, cursor: 'pointer', fontSize: '0.9rem' }}>← Back</button>
        <span style={{ color: THEME.BORDER }}>|</span>
        <span style={{ color: THEME.FG_PRIMARY, fontSize: '0.95rem', fontWeight: 500 }}>Run: {experimentId}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {(['general', 'notebook'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600,
              border: `1px solid ${mode === m ? THEME.ACCENT_PRIMARY : THEME.BORDER}`,
              backgroundColor: mode === m ? `${THEME.ACCENT_PRIMARY}22` : 'transparent',
              color: mode === m ? THEME.ACCENT_PRIMARY : THEME.FG_SECONDARY,
              cursor: 'pointer', textTransform: 'capitalize',
            }}>{m === 'notebook' ? '📓 Notebook' : '💬 Chat'}</button>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT: Chat Panel ─────────────────────────────────────────────── */}
        <div style={{ flex: mode === 'notebook' ? '0 0 42%' : '1', display: 'flex', flexDirection: 'column', borderRight: mode === 'notebook' ? `1px solid ${THEME.BORDER}` : 'none', overflow: 'hidden' }}>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {messages.length === 0 && !isStreaming && (
              <div style={{ margin: 'auto', textAlign: 'center', color: THEME.FG_SECONDARY }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>🎙️</div>
                <p style={{ fontSize: '0.95rem' }}>Press the mic and ask a research question.</p>
                <p style={{ fontSize: '0.82rem', opacity: 0.6 }}>Powered by Cloudflare Workers AI Whisper</p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {/* Thought trail */}
                {msg.role === 'assistant' && msg.thoughts && msg.thoughts.length > 0 && (
                  <ThoughtTrail thoughts={msg.thoughts} />
                )}

                {/* Bubble */}
                <div style={{
                  maxWidth: '94%', padding: '14px 18px', borderRadius: 10,
                  backgroundColor: msg.role === 'user' ? THEME.ACCENT_PRIMARY : THEME.BG_MEDIUM,
                  color: THEME.FG_PRIMARY, fontSize: '0.93rem', lineHeight: 1.65,
                }}>
                  {msg.role === 'user' ? msg.content : (
                    <CitedContent
                      text={msg.content}
                      sources={msg.sources || []}
                      onCiteClick={setActiveSource}
                    />
                  )}
                </div>

                {/* Bibliography */}
                {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                  <div style={{ marginTop: 10, paddingLeft: 4, width: '94%' }}>
                    <div style={{ fontSize: '0.78rem', color: THEME.FG_SECONDARY, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>References</div>
                    {msg.sources.map(src => (
                      <div key={src.id} style={{ fontSize: '0.82rem', color: THEME.FG_SECONDARY, marginBottom: 4, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span style={{ color: THEME.ACCENT_PRIMARY, fontWeight: 700, flexShrink: 0 }}>[{src.id}]</span>
                        <span
                          onClick={() => setActiveSource(src)}
                          style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                        >
                          {src.title}
                        </span>
                        {src.url && (
                          <a href={src.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: THEME.DNA_PRIMARY, fontSize: '0.75rem', flexShrink: 0 }}>↗</a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Live streaming state */}
            {isStreaming && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                {streamingThoughts.length > 0 && <ThoughtTrail thoughts={streamingThoughts} />}
                {streamingText && (
                  <div style={{ maxWidth: '94%', padding: '14px 18px', borderRadius: 10, backgroundColor: THEME.BG_MEDIUM, color: THEME.FG_PRIMARY, fontSize: '0.93rem', lineHeight: 1.65 }}>
                    <ReactMarkdown components={mdComponents as any}>{streamingText}</ReactMarkdown>
                    <span style={{ display: 'inline-block', width: 8, height: 14, backgroundColor: THEME.ACCENT_PRIMARY, marginLeft: 2, animation: 'blink 1s step-end infinite', borderRadius: 1 }} />
                    <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
                  </div>
                )}
                {!streamingText && (
                  <div style={{ fontSize: '0.85rem', color: THEME.ACCENT_PRIMARY, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                    {streamingThoughts.at(-1) || 'Initializing...'}
                  </div>
                )}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Voice input bar */}
          <div style={{ padding: '16px 20px', borderTop: `1px solid ${THEME.BORDER}`, backgroundColor: THEME.BG_DARK, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
            {(isListening || isTranscribing) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AudioWaveform analyserNode={analyserNode} isListening={isListening} />
                <span style={{ fontSize: '0.82rem', color: isTranscribing ? THEME.DNA_PRIMARY : THEME.ACCENT_PRIMARY }}>
                  {isTranscribing ? '⚡ Transcribing via Whisper...' : '🔴 Recording...'}
                </span>
              </div>
            )}
            {liveTranscript && !isListening && (
              <div style={{ fontSize: '0.85rem', color: THEME.FG_SECONDARY, fontStyle: 'italic' }}>{liveTranscript}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={isListening ? stopMic : startMic}
                disabled={isStreaming || isTranscribing}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '11px 28px', borderRadius: 8,
                  backgroundColor: isListening ? THEME.ACCENT_DANGER : THEME.ACCENT_PRIMARY,
                  color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.95rem',
                  cursor: (isStreaming || isTranscribing) ? 'not-allowed' : 'pointer',
                  opacity: (isStreaming || isTranscribing) ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {isListening ? '⏹ Stop & Transcribe' : '🎙 Start Voice Command'}
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Notebook Panel ─────────────────────────────────────────── */}
        {mode === 'notebook' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: THEME.BG_DARK, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${THEME.BORDER}`, backgroundColor: THEME.BG_MEDIUM }}>
              <span style={{ fontSize: '0.8rem', color: THEME.FG_SECONDARY, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                📋 Immutable Log Stream
              </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {logs.length === 0 && (
                <p style={{ color: THEME.FG_SECONDARY, fontSize: '0.9rem' }}>No entries yet. Use the voice copilot or add a manual observation below.</p>
              )}
              {logs.map(log => (
                <div key={log.id} style={{
                  borderLeft: `3px solid ${log.source === 'copilot' ? THEME.ACCENT_PRIMARY : THEME.DNA_PRIMARY}`,
                  backgroundColor: THEME.BG_MEDIUM, padding: '14px 16px', borderRadius: '0 8px 8px 0',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.78rem', color: THEME.FG_SECONDARY }}>
                    <span style={{ fontWeight: 700, color: log.source === 'copilot' ? THEME.ACCENT_PRIMARY : THEME.FG_PRIMARY }}>
                      {log.source.toUpperCase()}
                    </span>
                    <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                  </div>
                  <div style={{ fontSize: '0.9rem', color: THEME.FG_PRIMARY, lineHeight: 1.65 }}>
                    <ReactMarkdown components={mdComponents as any}>{log.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: 16, borderTop: `1px solid ${THEME.BORDER}`, backgroundColor: THEME.BG_DARKEST, flexShrink: 0 }}>
              <textarea
                value={newEntry}
                onChange={e => setNewEntry(e.target.value)}
                placeholder="Add a manual observation..."
                style={{ width: '100%', backgroundColor: 'transparent', color: THEME.FG_PRIMARY, border: `1px solid ${THEME.BORDER}`, borderRadius: 6, padding: 10, fontSize: '0.9rem', minHeight: 72, resize: 'vertical', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleManualLog} style={{ padding: '7px 18px', backgroundColor: THEME.DNA_PRIMARY, color: '#000', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                  Save Entry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Source Drawer overlay */}
      {activeSource && (
        <>
          <div onClick={() => setActiveSource(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 99 }} />
          <SourceDrawer source={activeSource} onClose={() => setActiveSource(null)} />
        </>
      )}
    </div>
  );
}