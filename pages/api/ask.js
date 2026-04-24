const SYSTEM_PROMPT = `Ти SQL асистент для PostgreSQL бази даних лікарні. Відповідаєш на питання українською та російською мовою.

Таблиці бази даних:

encounters (20491 рядків) — госпіталізації:
  encounter_id, hosp_type, admission_at (timestamp), discharge_at (timestamp),
  bed_days, discharge_status, icd_main, diagnosis_main, icd_admission, diagnosis_admission,
  operation_code, death_verification, patient_pk, doctor_id, dept_admission_id, dept_discharge_id, doctor_id_imputed

patients (15427):
  patient_pk, patient_name, patient_age, patient_gender, patient_category, region, district, city

doctors (202):
  doctor_id, doctor_name, doctor_specialty, doctor_position

departments (13):
  department_id, department_name

lsmd_staging (20495) — для текстового пошуку:
  patient_name, doctor_name, dept_admission, dept_discharge, diagnosis_main, icd_main,
  discharge_status, hosp_type, bed_days, admission_at(text), operation_code, region, district, city

Зв'язки:
  encounters.patient_pk → patients.patient_pk
  encounters.doctor_id → doctors.doctor_id
  encounters.dept_admission_id → departments.department_id

ВАЖЛИВО: Відповідай ТІЛЬКИ валідним JSON без жодного тексту:
{"sql": "SELECT ...", "explanation": "Короткий опис"}

Правила:
- Тільки SELECT, без крапки з комою в кінці
- Пошук лікаря: doctor_name ILIKE '%прізвище%'
- Дані за 2025 рік. "Останній місяць" = admission_at >= '2025-12-01'
- Смерть: discharge_status = 'Помер'
- Лікар в encounters: COALESCE(e.doctor_id, e.doctor_id_imputed)
- LIMIT 50 для списків`

const PRICING = {
  'llama-3.3-70b-versatile': { in: 0, out: 0, provider: 'Groq', free: true },
  'gpt-4o-mini': { in: 0.15, out: 0.60, provider: 'OpenAI', free: false },
  'gpt-4o': { in: 2.50, out: 10.00, provider: 'OpenAI', free: false },
}

const MODEL = 'llama-3.3-70b-versatile'

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

    const r1 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 1000
      })
    })

    // Читаємо ліміти з заголовків
    const limits = {
      requests_remaining: r1.headers.get('x-ratelimit-remaining-requests'),
      tokens_remaining: r1.headers.get('x-ratelimit-remaining-tokens'),
      requests_limit: r1.headers.get('x-ratelimit-limit-requests'),
      tokens_limit: r1.headers.get('x-ratelimit-limit-tokens'),
      reset_requests: r1.headers.get('x-ratelimit-reset-requests'),
      reset_tokens: r1.headers.get('x-ratelimit-reset-tokens')
    }

    const d1 = await r1.json()
    if (d1.error) throw new Error(d1.error.message)
    const raw = d1.choices?.[0]?.message?.content || ''

    const usage = d1.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    const pricing = PRICING[MODEL]
    const cost = (usage.prompt_tokens / 1000000) * pricing.in + (usage.completion_tokens / 1000000) * pricing.out

    const tokenInfo = {
      provider: pricing.provider,
      model: MODEL,
      tokens_in: usage.prompt_tokens,
      tokens_out: usage.completion_tokens,
      tokens_total: usage.total_tokens,
      cost_usd: cost,
      free: pricing.free,
      limits
    }

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
      body: JSON.stringify({ sql_query: parsed.sql.replace(/;\s*$/, '') })
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

    res.status(200).json({ 
      sql: parsed.sql, 
      explanation: parsed.explanation, 
      rows,
      tokens: tokenInfo
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
