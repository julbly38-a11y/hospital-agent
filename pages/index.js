import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'

const PROVIDERS = [
  { id: 'groq', name: 'Groq', label: 'безкоштовно', free: true },
  { id: 'gemini', name: 'Gemini', label: 'безкоштовно', free: true },
  { id: 'openai', name: 'OpenAI', label: '$0.15/M', free: false },
  { id: 'anthropic', name: 'Anthropic', label: '$3/M', free: false },
]

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
    return <div className={styles.emptyResult}><span>○</span><p>Результатів не знайдено</p></div>
  }
  const cols = Object.keys(rows[0])
  const isSingleNumber = rows.length === 1 && cols.length === 1 && typeof Object.values(rows[0])[0] === 'number'
  const isSmallStat = rows.length === 1 && cols.length <= 4

  if (isSingleNumber) {
    const key = cols[0]
    return <div className={styles.bigCard}><p className={styles.bigNum}>{rows[0][key]}</p><p className={styles.bigLabel}>{colLabel(key)}</p></div>
  }
  if (isSmallStat) {
    return <div className={styles.statGrid}>
      {cols.map(key => (
        <div key={key} className={styles.statCard}>
          <p className={styles.statVal}>{formatValue(key, rows[0][key])}</p>
          <p className={styles.statKey}>{colLabel(key)}</p>
        </div>
      ))}
    </div>
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr>{cols.map(c => <th key={c}>{colLabel(c)}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{cols.map(c => <td key={c}>{formatValue(c, row[c])}</td>)}</tr>)}</tbody>
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

function formatNum(n) {
  if (n === null || n === undefined || n === '') return '—'
  return Number(n).toLocaleString('en-US')
}

function TokenBadge({ tokens }) {
  if (!tokens) return null
  return (
    <div style={{
      display: 'inline-flex', gap: '10px', marginTop: '10px', padding: '6px 10px',
      background: 'var(--bg2)', borderRadius: '6px', fontSize: '11px',
      f
