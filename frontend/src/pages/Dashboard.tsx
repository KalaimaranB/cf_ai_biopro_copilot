import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { THEME, Icons } from '../theme';

const BACKEND_URL = 'https://backend.biopro.workers.dev';

interface Project {
  id: string;
  title: string;
  created_at: string;
  experiment_count: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = () => {
    setIsLoading(true);
    fetch(`${BACKEND_URL}/api/projects`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.projects) setProjects(data.projects);
      })
      .catch(err => console.error("Failed to fetch projects:", err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleNewProject = async () => {
    const title = prompt("Enter a title for the new research project:");
    if (!title) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title })
      });
      if (res.ok) fetchProjects(); 
    } catch (err) {
      console.error("Failed to create project", err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation(); 
    if (!window.confirm(`Are you sure you want to delete "${title}"? This will destroy all experiments and logs inside it.`)) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/projects?id=${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) fetchProjects();
    } catch (err) {
      console.error("Failed to delete project", err);
    }
  };

  return (
    <div style={{ padding: '40px', width: '100%', overflowY: 'auto', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '2rem', fontWeight: 600, color: THEME.FG_PRIMARY, letterSpacing: '-0.5px' }}>Active Projects</h2>
          <p style={{ margin: 0, color: THEME.FG_SECONDARY, fontSize: '0.95rem' }}>Select a research project to view its experiments and access the Copilot.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          {/* NEW: Knowledge Base Button */}
          <button 
            onClick={() => navigate('/knowledge')} 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: THEME.BG_MEDIUM, color: THEME.FG_PRIMARY, border: `1px solid ${THEME.BORDER}`, borderRadius: '8px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = THEME.BG_LIGHT; e.currentTarget.style.borderColor = THEME.FG_SECONDARY; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = THEME.BG_MEDIUM; e.currentTarget.style.borderColor = THEME.BORDER; }}
          >
            <Icons.Notebook /> Knowledge Base
          </button>

          <button 
            onClick={handleNewProject} 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: THEME.ACCENT_PRIMARY, color: '#FFF', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease', opacity: 0.9 }}
            onMouseOver={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseOut={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            + New Project
          </button>
        </div>
      </div>

      {/* Content Section */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: THEME.ACCENT_PRIMARY, marginTop: '40px' }}>
          <Icons.Brain />
          <span className="pulse-animation">Loading secure project data...</span>
        </div>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 40px', border: `2px dashed ${THEME.BORDER}`, borderRadius: '12px', color: THEME.FG_SECONDARY, backgroundColor: THEME.BG_DARK }}>
          <div style={{ marginBottom: '16px', opacity: 0.5 }}><Icons.Activity /></div>
          <h3 style={{ margin: '0 0 8px 0', color: THEME.FG_PRIMARY }}>No active projects</h3>
          <p style={{ margin: 0 }}>Click "+ New Project" to begin logging your research.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {projects.map((project) => (
            <div 
              key={project.id}
              onClick={() => navigate(`/project/${project.id}`)}
              style={{ backgroundColor: THEME.BG_DARK, border: `1px solid ${THEME.BORDER}`, borderRadius: '12px', padding: '24px', cursor: 'pointer', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative', display: 'flex', flexDirection: 'column' }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = THEME.ACCENT_PRIMARY;
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 12px 24px -10px rgba(0,0,0,0.3)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = THEME.BORDER;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', color: THEME.FG_PRIMARY, fontWeight: 600 }}>{project.title}</h3>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: THEME.FG_SECONDARY, fontSize: '0.85rem', borderTop: `1px solid ${THEME.BORDER}`, paddingTop: '16px', marginTop: '16px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: THEME.BG_MEDIUM, padding: '4px 10px', borderRadius: '12px', color: THEME.FG_PRIMARY }}>
                  <span style={{ width: '8px', height: '8px', backgroundColor: THEME.DNA_PRIMARY, borderRadius: '50%' }}></span>
                  {project.experiment_count} Experiments
                </span>
                <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
              </div>

              {/* Delete Button - Made slightly more subtle until hovered */}
              <button 
                onClick={(e) => handleDelete(e, project.id, project.title)}
                style={{ position: 'absolute', top: '20px', right: '20px', background: THEME.BG_MEDIUM, border: `1px solid ${THEME.BORDER}`, color: THEME.ACCENT_DANGER, cursor: 'pointer', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', opacity: 0.6, transition: 'all 0.2s' }}
                onMouseOver={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = THEME.ACCENT_DANGER; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.borderColor = THEME.BORDER; }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}