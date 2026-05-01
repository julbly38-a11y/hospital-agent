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
- LIMIT 50 для списків`

const PROVIDERS = {
  groq: {
    name: 'Groq', model: 'llama-3.3-70b-versatile',
    pricing: { in: 0, out: 0, free: true },
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY', format: 'openai'
  },
  gemini: {
    name: 'Gemini', model: 'gemini-2.0-flash',
    pricing: { in: 0, out: 0, free: true },
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    keyEnv: 'GEMINI_API_KEY', format: 'gemini'
  },
  openai: {
    name: 'OpenAI', model: 'gpt-4o-mini',
    pricing: { in: 0.15, out: 0.60, free: false },
    url: 'https://api.openai.com/v1/chat/completions',
    keyEnv: 'OPENAI_API_KEY', format: 'openai'
  },
  anthropic: {
    name: 'Anthropic', model: 'claude-sonnet-4-20250514',
    pricing: { in: 3.00, out: 15.00, free: false },
    url: 'https://api.anthropic.com/v1/messages',
    keyEnv: 'ANTHROPIC_API_KEY', format: 'anthropic'
  }
}

async function callAI(provider, messages) {
  const cfg = PROVIDERS[provider]
  const apiKey = process.env[cfg.keyEnv]
  if (!apiKey) throw new Error(`Немає ключа ${cfg.keyEnv} в Netlify`)

  if (cfg.format === 'openai') {
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, max_tokens: 1000 })
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message)
    return {
      text: d.choices?.[0]?.message?.content || '',
      tokens_in: d.usage?.prompt_tokens || 0,
      tokens_out: d.usage?.completion_tokens || 0,
      limits: {
        requests_remaining: r.headers.get('x-ratelimit-remaining-requests'),
        tokens_remaining: r.headers.get('x-ratelimit-remaining-tokens'),
        requests_limit: r.headers.get('x-ratelimit-limit-requests'),
        tokens_limit: r.headers.get('x-ratelimit-limit-tokens'),
      }
    }
  }

  if (cfg.format === 'gemini') {
    const sys = messages.find(m => m.role === 'system')?.content || ''
    const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
    const r = await fetch(`${cfg.url}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: userMessages,
        systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
        generationConfig: { maxOutputTokens: 1000 }
      })
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message)
    return {
      text: d.candidates?.[0]?.content?.parts?.[0]?.text || '',
      tokens_in: d.usageMetadata?.promptTokenCount || 0,
      tokens_out: d.usageMetadata?.candidatesTokenCount || 0,
      limits: null
    }
  }

  if (cfg.format === 'anthropic') {
    const sys = messages.find(m => m.role === 'system')?.content || ''
    const userMessages = messages.filter(m => m.role !== 'system')
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: cfg.model, system: sys, messages: userMessages, max_tokens: 1000 })
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message)
    return {
      text: d.content?.[0]?.text || '',
      tokens_in: d.usage?.input_tokens || 0,
      tokens_out: d.usage?.output_tokens || 0,
      limits: null
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { question, history = [], provider = 'groq' } = req.body
  if (!question) return res.status(400).json({ error: 'Немає питання' })
  if (!PROVIDERS[provider]) return res.status(400).json({ error: 'Невідомий провайдер' })

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: question }
    ]

    const aiResult = await callAI(provider, messages)
    const cfg = PROVIDERS[provider]
    const cost = (aiResult.tokens_in / 1000000) * cfg.pricing.in + (aiResult.tokens_out / 1000000) * cfg.pricing.out

    let parsed
    try { parsed = JSON.parse(aiResult.text) }
    catch {
      const m = aiResult.text.match(/\{[\s\S]*\}/)
      if (m) parsed = JSON.parse(m[0])
      else throw new Error('Не вдалось розпарсити відповідь AI')
    }

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
      tokens: {
        provider: cfg.name,
        model: cfg.model,
        tokens_in: aiResult.tokens_in,
        tokens_out: aiResult.tokens_out,
        tokens_total: aiResult.tokens_in + aiResult.tokens_out,
        cost_usd: cost,
        free: cfg.pricing.free,
        limits: aiResult.limits
      }
}
