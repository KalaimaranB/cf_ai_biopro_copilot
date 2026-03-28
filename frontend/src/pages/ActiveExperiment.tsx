import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { THEME } from '../theme';
import type { Message } from '../types';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

import ChatSidebar from '../components/ChatSidebar';
import NotebookEditor from '../components/NotebookEditor';

const BACKEND_URL = 'https://backend.biopro.workers.dev'; 

export default function ActiveExperiment() {
  const { experimentId } = useParams();
  const navigate = useNavigate();
  
  const [mode, setMode] = useState<'general' | 'notebook'>('notebook');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/logs?experimentId=${experimentId}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => { if (data.logs) setLogs(data.logs); })
      .catch(err => console.error("Failed to load logs:", err));
  }, [experimentId]);

  const handleManualLog = async (content: string) => {
    const tempLog = { id: `temp-${Date.now()}`, content, source: 'researcher', created_at: new Date().toISOString() };
    setLogs(prev => [...prev, tempLog]); 

    fetch(`${BACKEND_URL}/api/logs?experimentId=${experimentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content, source: 'researcher' })
    }).catch(err => console.error("Save failed:", err));
  };

  const handleSpeechComplete = async (text: string) => {
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);
    setAgentStatus("Agent is initializing...");
    
    try {
      const isDocQuery = text.toLowerCase().startsWith("protocol") || text.toLowerCase().startsWith("search");
      
      const response = await fetch(`${BACKEND_URL}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userMessage: text, mode: isDocQuery ? 'documentation' : 'general' })
      });

      if (!response.ok) throw new Error("Network error");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let buffer = ""; 

      while (!done && reader) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          
          let boundary = buffer.indexOf('\n\n');
          while (boundary !== -1) {
            // Trim extra whitespace from the chunk to prevent silent JSON failures
            const chunk = buffer.slice(0, boundary).trim(); 
            buffer = buffer.slice(boundary + 2);
            
            if (chunk.startsWith('data: ')) {
              const dataStr = chunk.substring(6);
              try {
                const parsedEvent = JSON.parse(dataStr);
                
                if (parsedEvent.type === 'status') {
                  setAgentStatus(parsedEvent.data);
                } 
                else if (parsedEvent.type === 'final') {
                  // We safely parse the inner payload here
                  const finalData = JSON.parse(parsedEvent.data);
                  
                  setMessages(prev => [...prev, { 
                    role: 'assistant', 
                    content: finalData.response || "No response generated.", 
                    toolsUsed: finalData.toolsUsed || [],
                    sources: finalData.sources || [] 
                  }]);
                  
                  if (mode === 'notebook') {
                     // 1. Compile the mechanical sources into a Markdown legend
                     let sourceLegend = "";
                     if (finalData.sources && finalData.sources.length > 0) {
                       sourceLegend = "\n\n---\n**Verified Sources:**\n" + finalData.sources.map((s: any) => 
                         `* [${s.id}] ${s.url ? `[${s.title}](${s.url})` : s.title}`
                       ).join('\n');
                     }

                     // 2. Weld the legend to the text payload
                     const aiContent = `**Voice Command:** ${text}\n\n**Output:**\n${finalData.response}${sourceLegend}`;
                     
                     // 3. Save to UI and Database
                     const tempLog = { id: `temp-${Date.now()}`, content: aiContent, source: 'copilot', created_at: new Date().toISOString() };
                     setLogs(prev => [...prev, tempLog]);
                     
                     fetch(`${BACKEND_URL}/api/logs?experimentId=${experimentId}`, {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       credentials: 'include',
                       body: JSON.stringify({ content: aiContent, source: 'copilot' })
                     });
                  }
                  
                  setAgentStatus(null); 
                }
              } catch (e) {
                console.error("Stream parse error on chunk:", dataStr, e);
              }
            }
            boundary = buffer.indexOf('\n\n');
          }
        }
      }
    } catch (error) {
      console.error("AI Copilot request failed:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Network connection lost or backend crash." }]);
      setAgentStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  const { isListening, liveTranscript, startMic, stopMic } = useSpeechRecognition(handleSpeechComplete);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div style={{ padding: '12px 32px', backgroundColor: THEME.BG_MEDIUM, borderBottom: `1px solid ${THEME.BORDER}`, display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'transparent', border: 'none', color: THEME.ACCENT_PRIMARY, cursor: 'pointer', fontSize: '0.9rem' }}>← Back</button>
        <span style={{ color: THEME.FG_SECONDARY }}>|</span>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 500, color: THEME.FG_PRIMARY }}>Active Run: {experimentId}</h2>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ChatSidebar messages={messages} liveTranscript={liveTranscript} isLoading={isLoading} isListening={isListening} onStart={startMic} onStop={stopMic} mode={mode} agentStatus={agentStatus} />
        {mode === 'notebook' && <NotebookEditor logs={logs} onAddLog={handleManualLog} />}
      </div>
    </div>
  );
}