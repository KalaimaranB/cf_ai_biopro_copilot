import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { THEME } from '../theme';

const BACKEND_URL = 'https://backend.biopro.workers.dev';

interface Experiment {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export default function ProjectDetails() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Live Fetch for this specific project
  const fetchExperiments = () => {
    setIsLoading(true);
    fetch(`${BACKEND_URL}/api/experiments?projectId=${projectId}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.experiments) setExperiments(data.experiments);
      })
      .catch(err => console.error("Failed to fetch experiments:", err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (projectId) fetchExperiments();
  }, [projectId]);

  // 2. Create a new experiment
  const handleNewExperiment = async () => {
    const title = prompt("Enter a title for the new experiment:");
    if (!title) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/experiments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId, title })
      });
      const data = await res.json();
      if (data.id) {
        navigate(`/experiment/${data.id}`); // Jump straight into the new ELN!
      }
    } catch (err) {
      console.error("Failed to create experiment", err);
    }
  };

  return (
    <div style={{ padding: '40px', width: '100%', overflowY: 'auto' }}>
      
      {/* Navigation Breadcrumb */}
      <div 
        onClick={() => navigate('/dashboard')}
        style={{ color: THEME.ACCENT_PRIMARY, cursor: 'pointer', fontSize: '0.9rem', marginBottom: '16px', display: 'inline-block' }}
      >
        ← Back to Projects Dashboard
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: 600, color: THEME.FG_PRIMARY }}>
            Project Workspace <span style={{ color: THEME.FG_SECONDARY, fontSize: '1rem', fontWeight: 400 }}>({projectId})</span>
          </h2>
          <p style={{ margin: 0, color: THEME.FG_SECONDARY, fontSize: '0.9rem' }}>Select an experiment to open the Electronic Lab Notebook and Copilot.</p>
        </div>
        <button onClick={handleNewExperiment} style={{ padding: '10px 20px', backgroundColor: THEME.ACCENT_PRIMARY, color: '#FFF', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
          + New Experiment
        </button>
      </div>

      {/* Live Experiments List */}
      {isLoading ? (
        <p style={{ color: THEME.FG_SECONDARY }}>Loading experiment data...</p>
      ) : experiments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', border: `1px dashed ${THEME.BORDER}`, borderRadius: '8px', color: THEME.FG_SECONDARY }}>
          No experiments yet. Click "+ New Experiment" to start logging.
        </div>
      ) : (
        <div style={{ backgroundColor: THEME.BG_DARK, border: `1px solid ${THEME.BORDER}`, borderRadius: '8px', overflow: 'hidden' }}>
          {experiments.map((exp, index) => (
            <div 
              key={exp.id}
              onClick={() => navigate(`/experiment/${exp.id}`)}
              style={{ 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                padding: '20px 24px', cursor: 'pointer', 
                borderBottom: index === experiments.length - 1 ? 'none' : `1px solid ${THEME.BORDER}`,
                backgroundColor: THEME.BG_DARK, transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = THEME.BG_MEDIUM}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = THEME.BG_DARK}
            >
              <div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: THEME.FG_PRIMARY }}>{exp.title}</h3>
                <span style={{ fontSize: '0.85rem', color: THEME.FG_SECONDARY }}>Experiment ID: {exp.id}</span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                <span style={{ 
                  fontSize: '0.85rem', fontWeight: 500,
                  color: exp.status === 'Completed' ? THEME.ACCENT_PRIMARY : (exp.status === 'In Progress' ? THEME.DNA_PRIMARY : THEME.FG_SECONDARY) 
                }}>
                  {exp.status.replace('_', ' ').toUpperCase()}
                </span>
                <span style={{ fontSize: '0.85rem', color: THEME.FG_SECONDARY, width: '100px', textAlign: 'right' }}>
                  {new Date(exp.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}