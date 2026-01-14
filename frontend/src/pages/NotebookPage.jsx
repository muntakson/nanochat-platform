import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import CodeCell from '../components/CodeCell'

export default function NotebookPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [notebook, setNotebook] = useState(null)
  const [cells, setCells] = useState([])
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [availableFiles, setAvailableFiles] = useState([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  useEffect(() => {
    loadNotebook()
  }, [id])

  const loadNotebook = async () => {
    try {
      const response = await axios.get(`/api/notebooks/${id}`)
      setNotebook(response.data)
      setCells(response.data.cells || [])
    } catch (error) {
      console.error('Failed to load notebook:', error)
      alert('Failed to load notebook')
      navigate('/dashboard')
    }
  }

  const saveNotebook = async () => {
    setSaving(true)
    try {
      await axios.put(`/api/notebooks/${id}`, {
        cells: cells.map(cell => ({
          type: cell.type || 'code',
          content: cell.content || '',
          output: cell.output || null,
          execution_count: cell.execution_count || null,
        })),
      })
      setLastSaved(new Date())
    } catch (error) {
      console.error('Failed to save notebook:', error)
      alert('Failed to save notebook')
    } finally {
      setSaving(false)
    }
  }

  const addCell = () => {
    setCells([...cells, {
      type: 'code',
      content: '',
      output: null,
      execution_count: null,
    }])
  }

  const updateCell = (index, updatedCell) => {
    const newCells = [...cells]
    newCells[index] = updatedCell
    setCells(newCells)
  }

  const deleteCell = (index) => {
    if (cells.length === 1) {
      alert('Cannot delete the last cell')
      return
    }
    if (confirm('Delete this cell?')) {
      setCells(cells.filter((_, i) => i !== index))
    }
  }

  const runAllCells = async () => {
    for (let i = 0; i < cells.length; i++) {
      // Trigger run for each cell - this is a simplified version
      // In reality, you'd need to coordinate with CodeCell component
      console.log(`Running cell ${i}`)
    }
  }

  const openFileDialog = async () => {
    setShowOpenModal(true)
    setLoadingFiles(true)
    try {
      const response = await axios.get('/api/ipynb/list')
      setAvailableFiles(response.data.files || [])
    } catch (error) {
      console.error('Failed to load files:', error)
      alert('Failed to load available files')
    } finally {
      setLoadingFiles(false)
    }
  }

  const loadIpynbFile = async (filename) => {
    try {
      const response = await axios.get(`/api/ipynb/load/${encodeURIComponent(filename)}`)
      const loadedCells = response.data.cells.map(cell => ({
        type: cell.type || 'code',
        content: cell.code || '',
        output: cell.output || null,
        execution_count: cell.execution_count || null,
      }))

      if (confirm(`Load "${filename}"? This will replace the current notebook cells.`)) {
        setCells(loadedCells)
        setShowOpenModal(false)
        alert(`Loaded ${loadedCells.length} cells from ${filename}`)
      }
    } catch (error) {
      console.error('Failed to load file:', error)
      alert('Failed to load file: ' + (error.response?.data?.detail || error.message))
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={() => navigate('/dashboard')} style={styles.backButton}>
            ← Back
          </button>
          <h1 style={styles.title}>{notebook?.name || 'Loading...'}</h1>
        </div>
        <div style={styles.headerRight}>
          {lastSaved && (
            <span style={styles.savedText}>
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button onClick={saveNotebook} disabled={saving} style={styles.saveButton}>
            {saving ? '💾 Saving...' : '💾 Save'}
          </button>
          <button onClick={addCell} style={styles.addCellButton}>
            + Add Cell
          </button>
        </div>
      </div>

      <div style={styles.content}>
        <div style={styles.toolbar}>
          <button onClick={openFileDialog} style={styles.toolbarButton}>
            📂 Open
          </button>
          <button onClick={runAllCells} style={styles.toolbarButton}>
            ▶️ Run All
          </button>
          <button onClick={() => setCells([])} style={styles.toolbarButton}>
            🗑️ Clear All Output
          </button>
          <div style={styles.info}>
            📊 {cells.length} cells
          </div>
        </div>

        <div style={styles.notebook}>
          {cells.length === 0 ? (
            <div style={styles.emptyState}>
              <h2>No cells yet</h2>
              <p>Click "Add Cell" to create your first code cell</p>
              <button onClick={addCell} style={styles.primaryButton}>
                + Add First Cell
              </button>
            </div>
          ) : (
            cells.map((cell, index) => (
              <CodeCell
                key={index}
                cell={cell}
                index={index}
                onChange={(updated) => updateCell(index, updated)}
                onDelete={() => deleteCell(index)}
              />
            ))
          )}
        </div>

        <div style={styles.addCellFooter}>
          <button onClick={addCell} style={styles.addCellButtonLarge}>
            + Add Cell
          </button>
        </div>
      </div>

      {/* Open File Modal */}
      {showOpenModal && (
        <div style={styles.modalOverlay} onClick={() => setShowOpenModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>📂 Open Notebook File</h2>
              <button
                onClick={() => setShowOpenModal(false)}
                style={styles.modalCloseButton}
              >
                ✕
              </button>
            </div>
            <div style={styles.modalBody}>
              {loadingFiles ? (
                <div style={styles.loadingState}>Loading files...</div>
              ) : availableFiles.length === 0 ? (
                <div style={styles.emptyFileList}>
                  <p>No .ipynb files found in the ipynb_files folder.</p>
                  <p style={{fontSize: '14px', color: '#666', marginTop: '10px'}}>
                    Add .ipynb files to: backend/ipynb_files/
                  </p>
                </div>
              ) : (
                <div style={styles.fileList}>
                  {availableFiles.map((file, index) => (
                    <div
                      key={index}
                      style={styles.fileItem}
                      onClick={() => loadIpynbFile(file.name)}
                    >
                      <div style={styles.fileName}>
                        📓 {file.name}
                      </div>
                      <div style={styles.fileInfo}>
                        {(file.size / 1024).toFixed(1)} KB • {new Date(file.modified * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#f5f5f5',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '15px 30px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
  },
  backButton: {
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.2)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  title: {
    margin: 0,
    fontSize: '24px',
  },
  savedText: {
    fontSize: '12px',
    opacity: 0.8,
  },
  saveButton: {
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.2)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  addCellButton: {
    padding: '8px 16px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    padding: '20px',
  },
  toolbar: {
    background: 'white',
    padding: '15px',
    borderRadius: '8px',
    marginBottom: '20px',
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  },
  toolbarButton: {
    padding: '8px 16px',
    background: '#f5f5f5',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  info: {
    marginLeft: 'auto',
    fontSize: '14px',
    color: '#666',
  },
  notebook: {
    background: 'transparent',
  },
  emptyState: {
    background: 'white',
    padding: '60px',
    borderRadius: '8px',
    textAlign: 'center',
    color: '#666',
  },
  primaryButton: {
    padding: '12px 24px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    marginTop: '20px',
  },
  addCellFooter: {
    marginTop: '20px',
    textAlign: 'center',
  },
  addCellButtonLarge: {
    padding: '12px 32px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
  },
  modalOverlay: {
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
  modal: {
    background: 'white',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '600px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  modalHeader: {
    padding: '20px 24px',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    margin: 0,
    fontSize: '20px',
    color: '#333',
  },
  modalCloseButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#999',
    padding: '0',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
  },
  modalBody: {
    padding: '20px 24px',
    overflowY: 'auto',
    flex: 1,
  },
  loadingState: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  emptyFileList: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fileItem: {
    padding: '16px',
    background: '#f8f9fa',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  fileName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '4px',
  },
  fileInfo: {
    fontSize: '12px',
    color: '#666',
  },
}
