import { useState } from 'react';
import { THEME } from '../theme';
import ReactMarkdown from 'react-markdown';

interface Log { id: string; content: string; source: string; created_at: string; }
interface EditorProps { logs: Log[]; onAddLog: (content: string) => void; }

export default function NotebookEditor({ logs, onAddLog }: EditorProps) {
  const [newEntry, setNewEntry] = useState('');

  const handleSave = () => {
    if (!newEntry.trim()) return;
    onAddLog(newEntry);
    setNewEntry('');
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: THEME.BG_DARK }}>
      <div style={{ padding: '12px 24px', borderBottom: `1px solid ${THEME.BORDER}`, backgroundColor: THEME.BG_MEDIUM, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', color: THEME.FG_SECONDARY, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Immutable Log Stream</span>
      </div>
      
      {/* The Log Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {logs.length === 0 && <p style={{ color: THEME.FG_SECONDARY }}>No logs yet. Start typing below or use the Voice Copilot.</p>}
        
        {logs.map((log) => (
          <div key={log.id} style={{ 
            borderLeft: `3px solid ${log.source === 'copilot' ? THEME.ACCENT_PRIMARY : THEME.DNA_PRIMARY}`, 
            backgroundColor: THEME.BG_MEDIUM, padding: '16px', borderRadius: '0 8px 8px 0' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem', color: THEME.FG_SECONDARY }}>
              <span style={{ fontWeight: 'bold', color: log.source === 'copilot' ? THEME.ACCENT_PRIMARY : THEME.FG_PRIMARY }}>{log.source.toUpperCase()}</span>
              <span>{new Date(log.created_at).toLocaleTimeString()}</span>
            </div>
            
            {/* THE MARKDOWN FIX: Intercepting the raw text and styling it */}
            <div style={{ fontSize: '0.95rem', lineHeight: '1.6', color: THEME.FG_PRIMARY }}>
              <ReactMarkdown
                components={{
                  h3: ({node, ...props}) => <h3 style={{ marginTop: '16px', marginBottom: '8px', fontSize: '1.1rem', fontWeight: 600, color: THEME.FG_PRIMARY }} {...props} />,
                  p: ({node, ...props}) => <p style={{ marginBottom: '12px' }} {...props} />,
                  ul: ({node, ...props}) => <ul style={{ paddingLeft: '24px', marginBottom: '12px', listStyleType: 'disc' }} {...props} />,
                  ol: ({node, ...props}) => <ol style={{ paddingLeft: '24px', marginBottom: '12px', listStyleType: 'decimal' }} {...props} />,
                  li: ({node, ...props}) => <li style={{ marginBottom: '6px' }} {...props} />,
                  strong: ({node, ...props}) => <strong style={{ fontWeight: 700, color: THEME.ACCENT_PRIMARY }} {...props} />,
                  a: ({node, ...props}) => <a style={{ color: THEME.DNA_PRIMARY, textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer" {...props} />
                }}
              >
                {log.content}
              </ReactMarkdown>
            </div>

          </div>
        ))}
      </div>

      {/* Manual Entry Input */}
      <div style={{ padding: '24px', borderTop: `1px solid ${THEME.BORDER}`, backgroundColor: THEME.BG_DARKEST }}>
        <textarea 
          value={newEntry} 
          onChange={(e) => setNewEntry(e.target.value)} 
          placeholder="Enter a manual observation..."
          style={{ width: '100%', backgroundColor: 'transparent', color: THEME.FG_PRIMARY, border: `1px solid ${THEME.BORDER}`, borderRadius: '6px', padding: '12px', fontSize: '0.95rem', minHeight: '80px', resize: 'vertical', outline: 'none', marginBottom: '12px' }} 
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleSave} style={{ padding: '8px 16px', backgroundColor: THEME.DNA_PRIMARY, color: '#FFF', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
            Save Entry
          </button>
        </div>
      </div>
    </div>
  );
}