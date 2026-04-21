import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'

const EXAMPLES = [
  'Скільки інсультів госпіталізовано за останній місяць?',
  'Топ 5 лікарів за кількістю пацієнтів',
  'Скільки пацієнтів померло цього року?',
  'Середня кількість ліжко-днів по відділеннях',
  'Скільки пролікувала доктор Дубець за грудень?',
  'Розподіл пацієнтів по регіонах',
]

export default function Home() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSql, setShowSql] = useState({})
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(question) {
    if (!question.trim() || loading) return
    setInput('')
    setLoading(true)

    const userMsg = { role: 'user', content: question }
    setMessages(prev => [...prev, userMsg])

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history })
      })
      const data = await res.json()

      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', error: data.error }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: question,
          explanation: data.explanation,
          sql: data.sql,
          rows: data.rows || []
        }])
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', error: e.message }])
    }
    setLoading(false)
  }

  function toggleSql(i) {
    setShowSql(prev => ({ ...prev, [i]: !prev[i] }))
  }

  function renderTable(rows) {
    if (!rows || rows.length === 0) return <p className={styles.noData}>Результатів не знайдено</p>
    const cols = Object.keys(rows[0])
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>{cols.map(c => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {cols.map(c => <td key={c}>{row[c] ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>ЛСМД — Медичний AI Асистент</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>+</span>
            <span className={styles.logoText}>ЛСМД<br /><small>AI Асистент</small></span>
          </div>

          <div className={styles.sideSection}>
            <p className={styles.sideLabel}>Приклади запитів</p>
            {EXAMPLES.map((ex, i) => (
              <button key={i} className={styles.exBtn} onClick={() => send(ex)}>
                {ex}
              </button>
            ))}
          </div>

          <div className={styles.sideFooter}>
            <p>База: Supabase PostgreSQL</p>
            <p>20,491 госпіталізацій</p>
            <p>15,427 пацієнтів</p>
          </div>
        </aside>

        <main className={styles.main}>
          <div className={styles.chatArea}>
            {messages.length === 0 && (
              <div className={styles.welcome}>
                <h1>Медичний AI Асистент</h1>
                <p>Запитуйте про госпіталізації, пацієнтів, лікарів, діагнози та статистику лікарні. Відповідаю на основі реальних даних бази.</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`${styles.msg} ${styles[msg.role]}`}>
                {msg.role === 'user' && (
                  <div className={styles.userBubble}>{msg.content}</div>
                )}
                {msg.role === 'assistant' && (
                  <div className={styles.agentBubble}>
                    {msg.error && <p className={styles.error}>Помилка: {msg.error}</p>}
                    {msg.explanation && <p className={styles.explanation}>{msg.explanation}</p>}
                    {msg.rows && renderTable(msg.rows)}
                    {msg.sql && (
                      <div className={styles.sqlBlock}>
                        <button className={styles.sqlToggle} onClick={() => toggleSql(i)}>
                          {showSql[i] ? '▲ сховати SQL' : '▼ показати SQL'}
                        </button>
                        {showSql[i] && <pre className={styles.sqlCode}>{msg.sql}</pre>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className={`${styles.msg} ${styles.assistant}`}>
                <div className={styles.agentBubble}>
                  <div className={styles.typing}>
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className={styles.inputArea}>
            <input
              className={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send(input)}
              placeholder="Запитайте про дані лікарні..."
              disabled={loading}
            />
            <button className={styles.sendBtn} onClick={() => send(input)} disabled={loading || !input.trim()}>
              {loading ? '...' : '→'}
            </button>
          </div>
        </main>
      </div>
    </>
  )
}
