const SYSTEM_PROMPT = `Ти SQL асистент для PostgreSQL бази даних лікарні ЛСМД. Відповідаєш українською та російською.

ОСНОВНІ ТАБЛИЦІ:

encounters (20,491) — госпіталізації:
  encounter_id, icd_main, diagnosis_main, patient_pk, doctor_id, discharge_status, admission_at

lsmd_staging (20,492) — текстовий пошук:
  icd_main, diagnosis_main, patient_name, doctor_name, discharge_status

patients (15,427), doctors (204), departments (13)

"Diagnoses" (2,048) — КАТАЛОГ ВСІХ 1498 ДІАГНОЗІВ:
  diagnosis_key, icd10_code, diagnosis_name, total_encounters
  ⚠️ ВАЖЛИВО: ЗАВЖДИ ВИКОРИСТОВУЙ ЛАПКИ: "Diagnoses" - це чутливе до регістру!

ПРАВИЛЬНИЙ JOIN:

SELECT COUNT(*) FROM lsmd_staging ls
INNER JOIN "Diagnoses" d ON ls.icd_main = d.icd10_code
WHERE d.diagnosis_name ILIKE '%панкреатит%'

НЕПРАВИЛЬНО (ДА ПОМИЛКА!):
- Без лапок: FROM Diagnoses (помилка 42703)
- Невірна колона: d.icd_code замість d.icd10_code
- Тип join: LEFT/RIGHT замість INNER

ПРИКЛАДИ:

📌 "Скільки панкреатиту?":
SELECT COUNT(*) FROM lsmd_staging ls
INNER JOIN "Diagnoses" d ON ls.icd_main = d.icd10_code
WHERE d.diagnosis_name ILIKE '%панкреатит%'

📌 "Панкреатит лікаря Деркача?":
SELECT COUNT(*) FROM lsmd_staging ls
INNER JOIN "Diagnoses" d ON ls.icd_main = d.icd10_code
WHERE d.diagnosis_name ILIKE '%панкреатит%' AND ls.doctor_name = 'Деркач Андрій Васильович'

📌 "Топ 10 діагнозів":
SELECT diagnosis_name, total_encounters FROM "Diagnoses"
ORDER BY total_encounters DESC LIMIT 10

ПРАВИЛА:

- Відповідай ТІЛЬКИ валідним JSON:
  {"sql": "SELECT ...", "explanation": "Опис"}
- Тільки SELECT, без крапки з комою
- ЗАВЖДИ використовуй лапки: "Diagnoses"
- ILIKE для текстового пошуку
- Правильно: ls.icd_main = d.icd10_code
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
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
