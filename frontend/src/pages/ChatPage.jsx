import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../store/AuthContext'
import axios from 'axios'

export default function ChatPage() {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const messagesEndRef = useRef(null)
  const abortControllerRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || isGenerating) return

    const userMessage = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsGenerating(true)

    // Add empty assistant message
    const assistantMessage = { role: 'assistant', content: '' }
    setMessages([...newMessages, assistantMessage])

    try {
      abortControllerRef.current = new AbortController()

      const response = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          messages: newMessages,
          stream: true,
          temperature: 1.0,
          max_tokens: 2048
        }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')

        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)

            if (data === '[DONE]') {
              setIsGenerating(false)
              break
            }

            try {
              const parsed = JSON.parse(data)

              if (parsed.error) {
                console.error('Stream error:', parsed.error)
                break
              }

              const content = parsed.choices?.[0]?.delta?.content

              if (content) {
                setMessages(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1].content += content
                  return updated
                })
              }
            } catch (e) {
              // Ignore JSON parse errors for incomplete chunks
            }
          }
        }
      }

    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Chat error:', error)
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1].content = 'Error: Failed to get response. Please try again.'
          return updated
        })
      }
    } finally {
      setIsGenerating(false)
      abortControllerRef.current = null
    }
  }

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsGenerating(false)
    }
  }

  const clearChat = () => {
    setMessages([])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.title}>💬 Chat with NanoChat</h1>
          <div style={styles.headerButtons}>
            <button onClick={clearChat} style={styles.clearButton}>
              Clear Chat
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={styles.messagesContainer}>
        <div style={styles.messagesWrapper}>
          {messages.length === 0 ? (
            <div style={styles.emptyState}>
              <h2>👋 Welcome to NanoChat!</h2>
              <p>Start a conversation by typing a message below.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.message,
                  ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage)
                }}
              >
                <div style={styles.messageRole}>
                  {msg.role === 'user' ? '👤 You' : '🤖 NanoChat'}
                </div>
                <div style={styles.messageContent}>
                  {msg.content || (isGenerating && idx === messages.length - 1 ? '●●●' : '')}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div style={styles.inputContainer}>
        <div style={styles.inputWrapper}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Shift+Enter for new line)"
            style={styles.input}
            rows={3}
            disabled={isGenerating}
          />
          <div style={styles.inputButtons}>
            {isGenerating ? (
              <button onClick={stopGeneration} style={styles.stopButton}>
                ⏸ Stop
              </button>
            ) : (
              <button onClick={sendMessage} style={styles.sendButton} disabled={!input.trim()}>
                ➤ Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#f9fafb',
  },
  header: {
    background: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '1rem 2rem',
  },
  headerContent: {
    maxWidth: '900px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: '600',
    color: '#111827',
  },
  headerButtons: {
    display: 'flex',
    gap: '0.5rem',
  },
  clearButton: {
    padding: '0.5rem 1rem',
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '2rem 1rem',
  },
  messagesWrapper: {
    maxWidth: '900px',
    margin: '0 auto',
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem 2rem',
    color: '#6b7280',
  },
  message: {
    marginBottom: '1.5rem',
    padding: '1rem',
    borderRadius: '0.75rem',
  },
  userMessage: {
    background: '#eff6ff',
    marginLeft: '3rem',
  },
  assistantMessage: {
    background: 'white',
    border: '1px solid #e5e7eb',
    marginRight: '3rem',
  },
  messageRole: {
    fontSize: '0.875rem',
    fontWeight: '600',
    marginBottom: '0.5rem',
    color: '#374151',
  },
  messageContent: {
    whiteSpace: 'pre-wrap',
    lineHeight: '1.6',
    color: '#111827',
  },
  inputContainer: {
    background: 'white',
    borderTop: '1px solid #e5e7eb',
    padding: '1rem 2rem',
  },
  inputWrapper: {
    maxWidth: '900px',
    margin: '0 auto',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontFamily: 'inherit',
    resize: 'none',
    marginBottom: '0.5rem',
  },
  inputButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
  },
  sendButton: {
    padding: '0.5rem 1.5rem',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontWeight: '600',
  },
  stopButton: {
    padding: '0.5rem 1.5rem',
    background: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontWeight: '600',
  },
}
