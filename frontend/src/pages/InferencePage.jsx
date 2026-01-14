import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

// Use relative URL - Vite proxy will forward to backend
const API_BASE = '/api'

function InferencePage() {
  const navigate = useNavigate()
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [temperature, setTemperature] = useState(0.8)
  const [topK, setTopK] = useState(50)
  const [maxTokens, setMaxTokens] = useState(512)
  const messagesEndRef = useRef(null)
  const abortControllerRef = useRef(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load available models
  useEffect(() => {
    loadModels()
  }, [])

  const loadModels = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await axios.get(`${API_BASE}/inference/models`)

      if (response.data.models && response.data.models.length > 0) {
        setModels(response.data.models)

        // Auto-select the first SFT model (best for chat)
        const sftModels = response.data.models.filter(m => m.type === 'sft')
        if (sftModels.length > 0) {
          // Find the model with the highest step
          const latestModel = sftModels.reduce((prev, current) =>
            (current.step > prev.step) ? current : prev
          )
          setSelectedModel(latestModel.path)
        } else {
          setSelectedModel(response.data.models[0].path)
        }
      } else {
        setError('No trained models found. Please train a model first.')
      }
    } catch (err) {
      console.error('Failed to load models:', err)
      setError(err.response?.data?.detail || 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedModel) return
    if (isGenerating) return

    const userMessage = { role: 'user', content: inputText.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInputText('')
    setIsGenerating(true)

    // Create assistant message placeholder
    const assistantMessage = { role: 'assistant', content: '' }
    setMessages([...newMessages, assistantMessage])

    try {
      abortControllerRef.current = new AbortController()

      const response = await fetch(`${API_BASE}/inference/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages,
          model: selectedModel,
          temperature: temperature,
          top_k: topK,
          max_tokens: maxTokens,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.error) {
                throw new Error(data.error)
              }

              if (data.done) {
                break
              }

              if (data.token) {
                assistantContent += data.token
                setMessages([...newMessages, { role: 'assistant', content: assistantContent }])
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue // Skip invalid JSON
              throw e
            }
          }
        }
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Generation aborted')
      } else {
        console.error('Generation error:', err)
        // Check for 503 service unavailable (inference not supported on this server)
        if (err.message && err.message.includes('503')) {
          setError('Web-based inference is not available on this ARM64/CPU server. Please use the nanochat CLI: cd /var/www/gpt2/nanochat && source .venv/bin/activate && python -m scripts.chat_cli -i sft')
        } else {
          setError(err.message || 'Failed to generate response')
        }
        // Remove the empty assistant message on error
        setMessages(newMessages)
      }
    } finally {
      setIsGenerating(false)
      abortControllerRef.current = null
    }
  }

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  const handleClearConversation = () => {
    setMessages([])
    setError('')
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const formatModelName = (model) => {
    const type = model.type.toUpperCase()
    const stepInfo = model.step ? ` (Step ${model.step})` : ''
    const valLoss = model.meta?.val_loss ? ` - Loss: ${model.meta.val_loss.toFixed(4)}` : ''
    return `${type} - ${model.name}${stepInfo}${valLoss}`
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation */}
      <div style={{
        background: '#2196F3',
        color: 'white',
        padding: '15px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'transparent',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.5)',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            ← Dashboard
          </button>
          <h2 style={{ margin: 0 }}>🤖 Model Inference</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {selectedModel && (
            <span style={{ fontSize: '14px', opacity: 0.9 }}>
              {isGenerating ? '🟢 Generating...' : '⚪ Ready'}
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
        {/* Sidebar - Model Selection */}
        <div style={{
          width: '350px',
          borderRight: '1px solid #ddd',
          padding: '20px',
          background: '#f9f9f9',
          overflowY: 'auto',
        }}>
          <h3 style={{ marginTop: 0 }}>Model Selection</h3>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
              <div>Loading models...</div>
            </div>
          ) : models.length === 0 ? (
            <div style={{
              padding: '20px',
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '4px',
            }}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>📦</div>
              <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>No models found</div>
              <div style={{ fontSize: '14px', color: '#666' }}>
                Train a model first to use inference
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Select Model:
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                  }}
                >
                  {models.map((model) => (
                    <option key={model.path} value={model.path}>
                      {formatModelName(model)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Model Info */}
              {selectedModel && models.find(m => m.path === selectedModel) && (
                <div style={{
                  background: 'white',
                  padding: '15px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  marginBottom: '20px',
                  fontSize: '13px',
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Model Info</div>
                  {(() => {
                    const model = models.find(m => m.path === selectedModel)
                    const meta = model.meta
                    return (
                      <div style={{ lineHeight: '1.8' }}>
                        <div><strong>Type:</strong> {model.type.toUpperCase()}</div>
                        {model.step && <div><strong>Step:</strong> {model.step}</div>}
                        {meta && (
                          <>
                            {meta.val_loss && <div><strong>Val Loss:</strong> {meta.val_loss.toFixed(4)}</div>}
                            {meta.model_config && (
                              <>
                                <div><strong>Layers:</strong> {meta.model_config.n_layer}</div>
                                <div><strong>Embed Dim:</strong> {meta.model_config.n_embd}</div>
                                <div><strong>Heads:</strong> {meta.model_config.n_head}</div>
                                <div><strong>Vocab Size:</strong> {meta.model_config.vocab_size}</div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Generation Settings */}
              <div style={{ marginBottom: '15px' }}>
                <h4 style={{ marginBottom: '10px' }}>Generation Settings</h4>

                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px' }}>
                  Temperature: {temperature.toFixed(2)}
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    style={{ width: '100%', marginTop: '5px' }}
                  />
                </label>

                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px' }}>
                  Top-K: {topK}
                  <input
                    type="range"
                    min="1"
                    max="200"
                    step="1"
                    value={topK}
                    onChange={(e) => setTopK(parseInt(e.target.value))}
                    style={{ width: '100%', marginTop: '5px' }}
                  />
                </label>

                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px' }}>
                  Max Tokens: {maxTokens}
                  <input
                    type="range"
                    min="50"
                    max="2048"
                    step="50"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    style={{ width: '100%', marginTop: '5px' }}
                  />
                </label>
              </div>

              <button
                onClick={handleClearConversation}
                disabled={messages.length === 0}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: messages.length === 0 ? '#ccc' : '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: messages.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                }}
              >
                🗑️ Clear Conversation
              </button>
            </>
          )}
        </div>

        {/* Chat Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'white' }}>
          {/* Server Notice */}
          <div style={{
            background: '#fff3cd',
            color: '#856404',
            padding: '15px 20px',
            borderBottom: '1px solid #ffc107',
            fontSize: '14px',
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>ℹ️ ARM64/CPU Server Notice</div>
            <div>Web-based chat is not available on this server (requires GPU + Flash Attention 3). Use the nanochat CLI for inference:</div>
            <div style={{
              background: '#fff',
              padding: '8px',
              marginTop: '8px',
              fontFamily: 'monospace',
              fontSize: '12px',
              borderRadius: '4px',
              border: '1px solid #ffc107',
            }}>
              cd /var/www/gpt2/nanochat && source .venv/bin/activate && python -m scripts.chat_cli -i sft
            </div>
          </div>

          {error && (
            <div style={{
              background: '#ffebee',
              color: '#c62828',
              padding: '15px',
              borderBottom: '1px solid #c62828',
            }}>
              {error}
            </div>
          )}

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
          }}>
            {messages.length === 0 ? (
              <div style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                color: '#999',
              }}>
                <div style={{ fontSize: '64px', marginBottom: '20px' }}>💬</div>
                <h3 style={{ margin: '10px 0' }}>Start a Conversation</h3>
                <p>Select a model and type your message below</p>
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div
                    key={index}
                    style={{
                      marginBottom: '20px',
                      display: 'flex',
                      justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div style={{
                      maxWidth: '70%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background: message.role === 'user' ? '#2196F3' : '#f5f5f5',
                      color: message.role === 'user' ? 'white' : 'black',
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                    }}>
                      <div style={{
                        fontSize: '11px',
                        opacity: 0.7,
                        marginBottom: '5px',
                        fontWeight: 'bold',
                      }}>
                        {message.role === 'user' ? 'You' : 'Assistant'}
                      </div>
                      {message.content}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area - DISABLED for ARM64/CPU */}
          <div style={{
            borderTop: '1px solid #ddd',
            padding: '20px',
            background: '#f9f9f9',
          }}>
            <div style={{
              background: '#ffebee',
              padding: '15px',
              borderRadius: '4px',
              marginBottom: '15px',
              border: '1px solid #c62828',
            }}>
              <div style={{ color: '#c62828', fontWeight: 'bold', marginBottom: '5px' }}>
                🚫 Web Chat Disabled
              </div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
                Flash Attention 3 kernels not available for GB10 GPU (compute capability 12.1). Use the CLI instead:
              </div>
              <div style={{
                background: '#333',
                color: '#0f0',
                padding: '10px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '13px',
              }}>
                $ cd /var/www/gpt2/nanochat<br/>
                $ source .venv/bin/activate<br/>
                $ python -m scripts.chat_cli -i sft
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', opacity: 0.5 }}>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Web chat is disabled on this server - use CLI (see above)"
                disabled={true}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  resize: 'vertical',
                  minHeight: '60px',
                  maxHeight: '200px',
                  fontFamily: 'inherit',
                  background: '#f5f5f5',
                  cursor: 'not-allowed',
                }}
              />
              <button
                disabled={true}
                style={{
                  padding: '12px 24px',
                  background: '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                }}
              >
                ▶ Send (Disabled)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InferencePage
