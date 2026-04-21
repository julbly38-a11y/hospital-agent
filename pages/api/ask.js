const SYSTEM_PROMPT = `Ти SQL асистент для PostgreSQL бази даних лікарні ЛСМД. Відповідаєш на питання українською та російською мовою.

ГОТОВІ VIEW (використовуй їх в першу чергу):
- v_hospital_summary — загальна статистика лікарні
- v_department_full — повна статистика по кожному відділенню (завідувач, штат, ургенція, летальність, хірургічна активність і т.д.)
- v_monthly_stats — динаміка по місяцях
- v_monthly_department — динаміка по місяцях і відділеннях
- v_doctor_stats — статистика по лікарях
- v_diagnosis_stats — статистика по діагнозах
- v_patient_stats — розподіл пацієнтів по віку і статі
- v_region_stats — географія пацієнтів
- v_readmissions — повторні госпіталізації
- v_urgency_stats — показники ургенції по відділеннях
- v_peak_by_hour — пікові навантаження по годинах доби
- v_peak_by_weekday — навантаження по днях тижня
- v_peak_by_month — сезонність по місяцях
- v_peak_by_hour_department — піки по годинах для кожного відділення

ОСНОВНІ ТАБЛИЦІ:
- lsmd_staging (20495) — головна для текстового пошуку
- encounters (20491) — для складних агрегатів з JOIN
- patients (15427), doctors (202), departments (13)

ПРАВИЛА SQL:
- Тільки SELECT
- Пошук по імені: ILIKE '%прізвище%'
- Дані за 2025 рік. "Останній місяць" = >= '2025-12-01', "квартал" = >= '2025-10-01'
- Смерть: discharge_status = 'Помер'
- LIMIT 50 для списків

ВАЖЛИВО: Відповідай ТІЛЬКИ валідним JSON:
{"sql": "SELECT ...", "explanation": "Короткий опис"}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { question, history = [] } = req.body
  if (!question) return res.status(400).json({ error: 'Немає питання' })

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: question }
    ]

    const r1 = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 1000
      })
    })

    const d1 = await r1.json()
    if (d1.error) throw new Error(d1.error.message)
    const raw = d1.choices?.[0]?.message?.content || ''

    let parsed
    try { parsed = JSON.parse(raw) }
    catch { const m = raw.match(/\{[\s\S]*\}/); parsed = JSON.parse(m[0]) }

    const r2 = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({ sql_query: parsed.sql })
    })

    let rows = []
    if (r2.ok) {
      const data = await r2.json()
      if (Array.isArray(data) && data.length > 0 && data[0].execute_sql !== undefined) {
        rows = data[0].execute_sql || []
      } else if (Array.isArray(data)) {
        rows = data
      }
    } else {
      const errText = await r2.text()
      throw new Error(`DB error: ${errText}`)
    }

    res.status(200).json({ sql: parsed.sql, explanation: parsed.explanation, rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
