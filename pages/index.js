import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'

const EXAMPLES = [
  'Загальна статистика лікарні',
  'Показники по всіх відділеннях',
  'Пікові навантаження по годинах',
  'Топ 10 діагнозів за кількістю випадків',
  'Летальність по відділеннях',
  'Скільки пролікувала доктор Дубець за грудень?',
  'Повторні госпіталізації — топ пацієнти',
  'Навантаження по днях тижня',
]

const COL_LABELS = {
  doctor_name: 'Лікар', patient_name: 'Пацієнт', department_name: 'Відділення',
  відділення: 'Відділення', завідувач: 'Завідувач', штат_лікарів: 'Штат',
  admission_at: 'Дата госпіталізації', discharge_at: 'Дата виписки',
  bed_days: 'Ліжко-днів', discharge_status: 'Статус виписки',
  diagnosis_main: 'Основний діагноз', icd_main: 'МКХ', patient_age: 'Вік',
  patient_gender: 'Стать', region: 'Регіон', count: 'Кількість',
  година: 'Година', всього: 'Всього', екстрених: 'Екстрених',
  летальність_відсоток: 'Летальність %', хірургічна_активність: 'Хір.акт %',
  відсоток_ургенції: 'Ургенція %', середній_ліжкодень: 'Сер.ліжкодень',
}

function formatValue(key, val) {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return new Date(val).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2} /)) {
    return new Date(val).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  if (typeof val === 'number' && !Number.isInteger(val)) return val.toFixed(1)
  if (typeof val === 'number') return String(val)
  return String(val)
}

function colLabel(key) {
  return COL_LABELS[key] || key.replace(/_/g, ' ')
}

function ResultView({ rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div className={styles.emptyResult}>
        <span>○</span>
        <p>Результатів не знайдено</p>
      </div>
    )
  }

  const cols = Object.keys(rows[0])
  const isSingleNumber = rows.length === 1 && cols.length === 1 && typeof Object.values(rows[0])[0] === 'number'
  const isSmallStat = rows.length === 1 && cols.length <= 4

  if (isSingleNumber) {
    const key = cols[0]
    const val = rows[0][key]
    return (
      <div className={styles.bigCard}>
        <p className={styles.bigNum}>{val}</p>
        <p className={styles.bigLabel}>{colLabel(key)}</p>
      </div>
    )
  }

  if (isSmallStat) {
    return (
      <div className={styles.statGrid}>
        {cols.map(key => (
          <div key={key} className={styles.statCard}>
            <p className={styles.statVal}>{formatValue(key, rows[0][key])}</p>
            <p className={styles.statKey}>{colLabel(key)}</p>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>{cols.map(c => <th key={c}>{colLabel(c)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {cols.map(c => <td key={c}>{formatValue(c, row[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.tableFooter}>{rows.length} записів</div>
    </div>
  )
}

function formatCost(cost) {
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `$${cost.toFixed(6)}`
  return `$${cost.toFixed(4)}`
}

function TokenBadge({ tokens }) {
  if (!tokens) return null
  return (
    <div style={{
      display: 'inline-flex',
      gap: '10px',
      marginTop: '10px',
      padding: '6px 10px',
      background: 'var(--bg2)',
      borderRadius: '6px',
      fontSize: '11px',
      fontFamily: 'var(--mono)',
      color: 'var(--text2)',
      flexWrap: 'wrap'
    }}>
      <span>{tokens.provider}</span>
      <span>↓ {tokens.tokens_in}</span>
      <span>↑ {tokens.tokens_out}</span>
      <span>Σ {tokens.tokens_total}</span>
      <span style={{color: tokens.free ? '#16a34a' : 'var(--text2)'}}>
        {tokens.free ? 'безкоштовно' : formatCost(tokens.cost_usd)}
      </span>
    </div>
  )
}

export default function Home() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSql, setShowSql] = useState({})
  const [stats, setStats] = useState({ count: 0, tokensIn: 0, tokensOut: 0, cost: 0 })
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
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
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
          role: 'assistant', content: question,
          explanation: data.explanation, sql: data.sql, rows: data.rows || [],
          tokens: data.tokens
        }])
        if (data.tokens) {
          setStats(prev => ({
            count: prev.count + 1,
            tokensIn: prev.tokensIn + data.tokens.tokens_in,
            tokensOut: prev.tokensOut + data.tokens.tokens_out,
            cost: prev.cost + data.tokens.cost_usd
          }))
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', error: e.message }])
    }
    setLoading(false)
  }

  return (
    <>
      <Head>
        <title>ЛСМД — Медичний Асистент</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>+</span>
            <div className={styles.logoText}>ЛСМД<small>AI Асистент</small></div>
          </div>
          <div className={styles.sideSection}>
            <p className={styles.sideLabel}>Приклади</p>
            {EXAMPLES.map((ex, i) => (
              <button key={i} className={styles.exBtn} onClick={() => send(ex)}>{ex}</button>
            ))}
          </div>
          <div className={styles.sideFooter}>
            <p>20,491 госпіталізацій</p>
            <p>15,427 пацієнтів</p>
            <p>13 відділень · 202 лікарі</p>
            <div style={{marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '10px', lineHeight: '1.8'}}>
              <p style={{color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px'}}>Статистика сесії</p>
              <p>Запитів: <strong>{stats.count}</strong></p>
              <p>Токенів ↓: <strong>{stats.tokensIn.toLocaleString('en-US')}</strong></p>
              <p>Токенів ↑: <strong>{stats.tokensOut.toLocaleString('en-US')}</strong></p>
              <p>Ціна: <strong>{formatCost(stats.cost)}</strong></p>
            </div>
          </div>
        </aside>

        <main className={styles.main}>
          <div className={styles.chatArea}>
            {messages.length === 0 && (
              <div className={styles.welcome}>
                <div className={styles.welcomeIcon}>+</div>
                <h1>Медичний AI Асистент</h1>
                <p>Запитуйте про госпіталізації, пацієнтів, лікарів, діагнози та статистику лікарні — відповідаю даними з бази.</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`${styles.msg} ${styles[msg.role]}`}>
                {msg.role === 'user' && (
                  <div className={styles.userBubble}>{msg.content}</div>
                )}
                {msg.role === 'assistant' && (
                  <div className={styles.agentBubble}>
                    {msg.error && (
                      <div className={styles.errorBox}>
                        <span className={styles.errorIcon}>!</span>
                        <p>{msg.error}</p>
                      </div>
                    )}
                    {msg.explanation && <p className={styles.explanation}>{msg.explanation}</p>}
                    {msg.rows && <ResultView rows={msg.rows} />}
                    {msg.sql && (
                      <div className={styles.sqlBlock}>
                        <button className={styles.sqlToggle} onClick={() => setShowSql(p => ({...p, [i]: !p[i]}))}>
                          {showSql[i] ? '▲ сховати SQL' : '▼ показати SQL'}
                        </button>
                        {showSql[i] && <pre className={styles.sqlCode}>{msg.sql}</pre>}
                      </div>
                    )}
                    {msg.tokens && <TokenBadge tokens={msg.tokens} />}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className={`${styles.msg} ${styles.assistant}`}>
                <div className={styles.agentBubble}>
                  <div className={styles.typing}><span/><span/><span/></div>
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
            <button className={styles.sendBtn} onClick={() => send(input)} disabled={loading || !input.trim()}>→</button>
          </div>
        </main>
      </div>
    </>
  )
}
