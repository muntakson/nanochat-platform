import { useState, useRef } from 'react'
import Editor from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import axios from 'axios'
import './CodeCell.css'

export default function CodeCell({ cell, index, onChange, onDelete, onRun }) {
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState(cell.output || '')
  const [editMode, setEditMode] = useState(false)
  const abortControllerRef = useRef(null)

  const isMarkdown = cell.type === 'markdown'

  const handleRun = async () => {
    setRunning(true)
    setOutput('')

    try {
      abortControllerRef.current = new AbortController()

      const response = await fetch('/api/execute/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          code: cell.content,
          timeout: 300,
        }),
        signal: abortControllerRef.current.signal,
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullOutput = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'stdout' || data.type === 'stderr') {
                fullOutput += data.text
                setOutput(fullOutput)
              } else if (data.type === 'error') {
                fullOutput += `\nError: ${data.text}`
                setOutput(fullOutput)
              } else if (data.type === 'done') {
                if (data.return_code !== 0) {
                  fullOutput += `\n[Exit code: ${data.return_code}]`
                  setOutput(fullOutput)
                }
              }
            } catch (e) {
              console.error('Parse error:', e)
            }
          }
        }
      }

      // Update cell output
      onChange({ ...cell, output: fullOutput })

    } catch (error) {
      if (error.name === 'AbortError') {
        const abortedOutput = output + '\n[Execution stopped by user]'
        setOutput(abortedOutput)
        onChange({ ...cell, output: abortedOutput })
      } else {
        const errorOutput = `Error: ${error.message}`
        setOutput(errorOutput)
        onChange({ ...cell, output: errorOutput })
      }
    } finally {
      setRunning(false)
      abortControllerRef.current = null
    }
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  // Render markdown cell
  if (isMarkdown) {
    return (
      <div style={styles.markdownCell}>
        <div style={styles.cellHeader}>
          <div style={styles.cellLabel}>Markdown [{index + 1}]</div>
          <div style={styles.cellActions}>
            {!editMode && (
              <button onClick={() => setEditMode(true)} style={styles.editButton}>
                ✏️ Edit
              </button>
            )}
            {editMode && (
              <button onClick={() => setEditMode(false)} style={styles.previewButton}>
                👁️ Preview
              </button>
            )}
            <button onClick={onDelete} style={styles.deleteButton}>
              🗑️
            </button>
          </div>
        </div>

        {editMode ? (
          <div style={styles.editorContainer}>
            <Editor
              height="200px"
              defaultLanguage="markdown"
              value={cell.content}
              onChange={(value) => onChange({ ...cell, content: value || '' })}
              theme="vs-light"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'on',
              }}
            />
          </div>
        ) : (
          <div className="markdown-content">
            <ReactMarkdown>{cell.content || ''}</ReactMarkdown>
          </div>
        )}
      </div>
    )
  }

  // Render code cell
  return (
    <div style={styles.cell}>
      <div style={styles.cellHeader}>
        <div style={styles.cellLabel}>In [{index + 1}]:</div>
        <div style={styles.cellActions}>
          {running ? (
            <button onClick={handleStop} style={styles.stopButton}>
              ⏹ Stop
            </button>
          ) : (
            <button onClick={handleRun} style={styles.runButton}>
              ▶ Run
            </button>
          )}
          <button onClick={onDelete} style={styles.deleteButton}>
            🗑️
          </button>
        </div>
      </div>

      <div style={styles.editorContainer}>
        <Editor
          height="200px"
          defaultLanguage="python"
          value={cell.content}
          onChange={(value) => onChange({ ...cell, content: value || '' })}
          theme="vs-light"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>

      {(output || running) && (
        <div style={styles.output}>
          <div style={styles.outputLabel}>Out [{index + 1}]:</div>
          <pre style={styles.outputContent}>
            {running && !output && 'Running...'}
            {output}
          </pre>
        </div>
      )}
    </div>
  )
}

const styles = {
  cell: {
    border: '1px solid #e0e0e0',
    borderRadius: '4px',
    marginBottom: '16px',
    background: 'white',
  },
  markdownCell: {
    border: '1px solid #e0e0e0',
    borderRadius: '4px',
    marginBottom: '16px',
    background: 'white',
  },
  cellHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#f5f5f5',
    borderBottom: '1px solid #e0e0e0',
  },
  cellLabel: {
    fontFamily: 'monospace',
    fontSize: '13px',
    fontWeight: '600',
    color: '#666',
  },
  cellActions: {
    display: 'flex',
    gap: '8px',
  },
  runButton: {
    padding: '4px 12px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  stopButton: {
    padding: '4px 12px',
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  deleteButton: {
    padding: '4px 8px',
    background: '#ff5722',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  editButton: {
    padding: '4px 12px',
    background: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  previewButton: {
    padding: '4px 12px',
    background: '#673AB7',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  editorContainer: {
    borderBottom: '1px solid #e0e0e0',
  },
  output: {
    background: '#fafafa',
  },
  outputLabel: {
    fontFamily: 'monospace',
    fontSize: '13px',
    fontWeight: '600',
    color: '#666',
    padding: '8px 12px',
    borderBottom: '1px solid #e0e0e0',
  },
  outputContent: {
    margin: 0,
    padding: '12px',
    fontFamily: 'monospace',
    fontSize: '13px',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    maxHeight: '400px',
    overflow: 'auto',
  },
}
