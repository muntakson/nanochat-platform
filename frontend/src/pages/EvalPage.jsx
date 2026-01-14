import { useState, useEffect } from 'react'
import { useAuth } from '../store/AuthContext'
import axios from 'axios'

export default function EvalPage() {
  const { user } = useAuth()
  const [benchmarks, setBenchmarks] = useState([])
  const [models, setModels] = useState([])
  const [selectedBenchmarks, setSelectedBenchmarks] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [runningTasks, setRunningTasks] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBenchmarks()
    loadModels()
    loadResults()
  }, [])

  const loadBenchmarks = async () => {
    try {
      const response = await axios.get('/api/eval/benchmarks')
      setBenchmarks(response.data.benchmarks)
    } catch (error) {
      console.error('Failed to load benchmarks:', error)
    }
  }

  const loadModels = async () => {
    try {
      const response = await axios.get('/api/eval/models')
      setModels(response.data.models)
      if (response.data.models.length > 0) {
        setSelectedModel(response.data.models[0].id)
      }
    } catch (error) {
      console.error('Failed to load models:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadResults = async () => {
    try {
      const response = await axios.get('/api/eval/results')
      const allResults = [
        ...response.data.active,
        ...response.data.cached
      ]
      setResults(allResults)
    } catch (error) {
      console.error('Failed to load results:', error)
    }
  }

  const toggleBenchmark = (benchmarkId) => {
    setSelectedBenchmarks(prev =>
      prev.includes(benchmarkId)
        ? prev.filter(id => id !== benchmarkId)
        : [...prev, benchmarkId]
    )
  }

  const runEvaluation = async () => {
    if (selectedBenchmarks.length === 0 || !selectedModel) {
      alert('Please select at least one benchmark and a model')
      return
    }

    try {
      const response = await axios.post('/api/eval/run', {
        model_id: selectedModel,
        benchmarks: selectedBenchmarks,
        use_cached: true
      })

      const taskId = response.data.task_id

      // Add to running tasks
      setRunningTasks(prev => [...prev, {
        task_id: taskId,
        model_id: selectedModel,
        benchmarks: selectedBenchmarks,
        status: 'running',
        progress: 0
      }])

      // Start polling for status
      pollTaskStatus(taskId)

    } catch (error) {
      console.error('Failed to start evaluation:', error)
      alert('Failed to start evaluation')
    }
  }

  const pollTaskStatus = async (taskId) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`/api/eval/status/${taskId}`)
        const task = response.data

        // Update running tasks
        setRunningTasks(prev =>
          prev.map(t => t.task_id === taskId ? task : t)
        )

        // If completed or failed, stop polling
        if (task.status === 'completed' || task.status === 'failed') {
          clearInterval(interval)

          // Remove from running tasks
          setRunningTasks(prev => prev.filter(t => t.task_id !== taskId))

          // Reload results
          loadResults()
        }

      } catch (error) {
        console.error('Failed to poll task status:', error)
        clearInterval(interval)
      }
    }, 2000) // Poll every 2 seconds
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>✅ Model Evaluation</h1>
      </div>

      <div style={styles.content}>
        {/* Configuration Section */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Configure Evaluation</h2>

          {/* Model Selection */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Select Model:</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={styles.select}
              disabled={loading}
            >
              {models.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>

          {/* Benchmark Selection */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Select Benchmarks:</label>
            <div style={styles.benchmarksGrid}>
              {benchmarks.map(benchmark => (
                <div key={benchmark.id} style={styles.benchmarkItem}>
                  <input
                    type="checkbox"
                    id={benchmark.id}
                    checked={selectedBenchmarks.includes(benchmark.id)}
                    onChange={() => toggleBenchmark(benchmark.id)}
                    style={styles.checkbox}
                  />
                  <label htmlFor={benchmark.id} style={styles.benchmarkLabel}>
                    <strong>{benchmark.name}</strong>
                    <div style={styles.benchmarkDesc}>{benchmark.description}</div>
                    <div style={styles.benchmarkMeta}>
                      {benchmark.num_examples} examples
                    </div>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <button onClick={runEvaluation} style={styles.runButton}>
            ▶ Run Evaluation
          </button>
        </div>

        {/* Running Tasks */}
        {runningTasks.length > 0 && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Running Evaluations</h2>
            {runningTasks.map(task => (
              <div key={task.task_id} style={styles.taskCard}>
                <div style={styles.taskHeader}>
                  <strong>{task.model_id}</strong>
                  <span style={styles.taskStatus}>{task.status}</span>
                </div>
                <div style={styles.taskProgress}>
                  <div style={{...styles.progressBar, width: `${task.progress}%`}} />
                </div>
                <div style={styles.taskMeta}>
                  {task.current_benchmark && `Running: ${task.current_benchmark}`}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results Table */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Evaluation Results</h2>
          {results.length === 0 ? (
            <div style={styles.emptyState}>
              <p>No results yet. Run an evaluation to see results here.</p>
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Model</th>
                  <th style={styles.th}>Benchmark</th>
                  <th style={styles.th}>Accuracy</th>
                  <th style={styles.th}>Score</th>
                  <th style={styles.th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {results.flatMap((result, resultIdx) =>
                  Object.entries(result.results || {}).map(([benchmark, data], benchIdx) => (
                    <tr key={`${resultIdx}-${benchIdx}`} style={styles.tr}>
                      <td style={styles.td}>{result.model_id}</td>
                      <td style={styles.td}>{benchmark}</td>
                      <td style={styles.td}>
                        {data.accuracy?.toFixed(2)}%
                      </td>
                      <td style={styles.td}>
                        {data.correct}/{data.total}
                      </td>
                      <td style={styles.td}>
                        {new Date(result.completed_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#f9fafb',
  },
  header: {
    background: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '1.5rem 2rem',
  },
  title: {
    margin: 0,
    fontSize: '1.75rem',
    fontWeight: '600',
    color: '#111827',
  },
  content: {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  section: {
    background: 'white',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    border: '1px solid #e5e7eb',
  },
  sectionTitle: {
    margin: '0 0 1rem 0',
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#111827',
  },
  formGroup: {
    marginBottom: '1.5rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: '500',
    color: '#374151',
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.5rem',
    fontSize: '1rem',
  },
  benchmarksGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '1rem',
  },
  benchmarkItem: {
    display: 'flex',
    gap: '0.75rem',
    padding: '1rem',
    background: '#f9fafb',
    borderRadius: '0.5rem',
    border: '1px solid #e5e7eb',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  },
  benchmarkLabel: {
    flex: 1,
    cursor: 'pointer',
  },
  benchmarkDesc: {
    fontSize: '0.875rem',
    color: '#6b7280',
    marginTop: '0.25rem',
  },
  benchmarkMeta: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    marginTop: '0.5rem',
  },
  runButton: {
    padding: '0.75rem 2rem',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  taskCard: {
    padding: '1rem',
    background: '#f9fafb',
    borderRadius: '0.5rem',
    marginBottom: '0.75rem',
    border: '1px solid #e5e7eb',
  },
  taskHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.75rem',
  },
  taskStatus: {
    fontSize: '0.875rem',
    color: '#6b7280',
  },
  taskProgress: {
    width: '100%',
    height: '8px',
    background: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    background: '#2563eb',
    transition: 'width 0.3s ease',
  },
  taskMeta: {
    fontSize: '0.875rem',
    color: '#6b7280',
    marginTop: '0.5rem',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '0.75rem',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: '600',
    color: '#374151',
  },
  tr: {
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding: '0.75rem',
    color: '#111827',
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem',
    color: '#9ca3af',
  },
}
