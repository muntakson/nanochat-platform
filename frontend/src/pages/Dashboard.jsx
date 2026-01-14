import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/AuthContext'
import axios from 'axios'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [notebooks, setNotebooks] = useState({})
  const [loading, setLoading] = useState(true)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDesc, setNewProjectDesc] = useState('')

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const response = await axios.get('/api/projects/')
      setProjects(response.data)

      // Load notebooks for each project
      const notebooksData = {}
      for (const project of response.data) {
        const nbResponse = await axios.get(`/api/notebooks/project/${project.id}`)
        notebooksData[project.id] = nbResponse.data
      }
      setNotebooks(notebooksData)
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const createProject = async () => {
    if (!newProjectName.trim()) return

    try {
      await axios.post('/api/projects/', {
        name: newProjectName,
        description: newProjectDesc || null,
      })
      setNewProjectName('')
      setNewProjectDesc('')
      setShowNewProject(false)
      loadProjects()
    } catch (error) {
      alert('Failed to create project')
    }
  }

  const createNotebook = async (projectId) => {
    const name = prompt('Notebook name:')
    if (!name) return

    try {
      const response = await axios.post('/api/notebooks/', {
        name,
        project_id: projectId,
      })
      navigate(`/notebook/${response.data.id}`)
    } catch (error) {
      alert('Failed to create notebook')
    }
  }

  const handleChatClick = () => {
    navigate('/chat')
  }

  const handleEvalClick = () => {
    navigate('/eval')
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🚀 NanoChat Platform</h1>
        <div style={styles.headerRight}>
          <div style={styles.navButtons}>
            <button onClick={handleChatClick} style={styles.navButton}>
              💬 Chat
            </button>
            <button onClick={handleEvalClick} style={styles.navButton}>
              ✅ Eval
            </button>
          </div>
          <div style={styles.userInfo}>
            <span>👤 {user?.username}</span>
            <button onClick={logout} style={styles.logoutButton}>Logout</button>
          </div>
        </div>
      </div>

      <div style={styles.content}>
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2>Your Projects</h2>
            <button onClick={() => setShowNewProject(true)} style={styles.primaryButton}>
              + New Project
            </button>
          </div>

          {showNewProject && (
            <div style={styles.modal}>
              <div style={styles.modalContent}>
                <h3>Create New Project</h3>
                <input
                  type="text"
                  placeholder="Project name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  style={styles.input}
                />
                <textarea
                  placeholder="Description (optional)"
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  style={{...styles.input, minHeight: '80px'}}
                />
                <div style={styles.modalActions}>
                  <button onClick={createProject} style={styles.primaryButton}>Create</button>
                  <button onClick={() => setShowNewProject(false)} style={styles.secondaryButton}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <p>Loading...</p>
          ) : projects.length === 0 ? (
            <div style={styles.emptyState}>
              <p>No projects yet. Create your first project to get started!</p>
            </div>
          ) : (
            <div style={styles.projectsGrid}>
              {projects.map((project) => (
                <div key={project.id} style={styles.projectCard}>
                  <h3 style={styles.projectName}>{project.name}</h3>
                  {project.description && (
                    <p style={styles.projectDesc}>{project.description}</p>
                  )}
                  <div style={styles.projectStats}>
                    📓 {notebooks[project.id]?.length || 0} notebooks
                  </div>

                  <div style={styles.notebooksList}>
                    {notebooks[project.id]?.map((notebook) => (
                      <div
                        key={notebook.id}
                        style={styles.notebookItem}
                        onClick={() => navigate(`/notebook/${notebook.id}`)}
                      >
                        📄 {notebook.name}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => createNotebook(project.id)}
                    style={styles.addNotebookButton}
                  >
                    + New Notebook
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: { minHeight: '100vh', background: '#f5f5f5' },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '20px 40px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { margin: 0 },
  headerRight: {
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
  },
  navButtons: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  navButton: {
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.9)',
    color: '#667eea',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
    transition: 'all 0.2s ease',
  },
  userInfo: { display: 'flex', gap: '15px', alignItems: 'center' },
  logoutButton: {
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.2)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  content: { padding: '40px' },
  section: { maxWidth: '1200px', margin: '0 auto' },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  primaryButton: {
    padding: '10px 20px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
  },
  secondaryButton: {
    padding: '10px 20px',
    background: '#ccc',
    color: '#333',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  projectsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px',
  },
  projectCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  projectName: { margin: '0 0 10px 0', color: '#333' },
  projectDesc: { fontSize: '14px', color: '#666', marginBottom: '15px' },
  projectStats: { fontSize: '14px', color: '#999', marginBottom: '15px' },
  notebooksList: { marginBottom: '15px' },
  notebookItem: {
    padding: '8px',
    background: '#f5f5f5',
    borderRadius: '4px',
    marginBottom: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  addNotebookButton: {
    width: '100%',
    padding: '10px',
    background: '#f0f0f0',
    border: '1px dashed #ccc',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px',
    color: '#999',
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: 'white',
    padding: '30px',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '500px',
  },
  input: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    marginBottom: '15px',
    fontSize: '14px',
  },
  modalActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  },
}
