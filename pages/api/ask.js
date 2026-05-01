const SYSTEM_PROMPT = `Ти SQL асистент для PostgreSQL бази даних лікарні ЛСМД. Відповідаєш українською та російською.

ОСНОВНІ ТАБЛИЦІ (ВИБІР ЗВИЧАЙНО):

encounters (20,491) — госпіталізації:
  encounter_id, case_code, hosp_type, e_referral, admission_at, discharge_at, bed_days, 
  discharge_status, icd_admission, diagnosis_admission, icd_main, diagnosis_main, 
  operation_code, death_verification, patient_pk, doctor_id, dept_admission_id, dept_discharge_id, doctor_id_imputed

patients (15,427) — пацієнти:
  patient_pk, patient_source_key, patient_id, patient_name, patient_birthday, patient_age, patient_gender, 
  patient_category, patient_address, patient_phone, passport_type, region, district, city

doctors (204) — лікарі:
  doctor_id, doctor_source_key, doctor_name, doctor_birthday, doctor_gender, doctor_email, doctor_specialty, 
  doctor_position, employee_status, home_department_id, doctor_phone, is_intern, doctor_inn

departments (13) — відділення:
  department_id, department_name, department_phone

lsmd_staging (20,492) — текстовий пошук (денормалізовано):
  patient_name, doctor_name, dept_admission, dept_discharge, diagnosis_main, icd_main, 
  discharge_status, hosp_type, bed_days, admission_at, region, district, city, operation_code

АНАЛІТИЧНІ ТАБЛИЦІ (CRM/довідники):

Diagnoses (2,048) — діагнози:
  diagnosis_key, icd10_code, diagnosis_name, admission_encounters, final_encounters, total_encounters

Procedures (790) — процедури:
  procedure_key, procedure_code, encounter_count

Departments (CRM, 13) — аналіз відділень:
  department_key, department_name, admission_encounters, discharge_encounters, home_doctors

Doctors (CRM, 204) — аналіз лікарів:
  doctor_key, full_name, specialty, position, employment_status, home_department, encounter_count

Patients (CRM, 85,029) — аналіз пацієнтів:
  patient_key, full_name, birth_date, sex, phone, region_name, district_name, city_name, 
  first_admission, last_discharge, encounter_count

Locations (1,154) — географія:
  location_key, region_name, district_name, city_name, patient_count, encounter_count

Lookup_Entities (47) — довідник сутностей
Semantic_Entities (40,205) — семантичні зв'язки

СИРІ ТАБЛИЦІ (для глибокого аналізу):

lsmd_clean (20,495) — очищені дані
lsmd_final (262,571) — фінальні медичні записи (складна структура)
grey_data (110,067) — необроблені дані з полями українською

СЕМАНТИЧНІ/НОРМАЛІЗОВАНІ (для складних запитів):

semantic_hospitalizations (108,395) — лікування з UUID
semantic_patients (60,849) — пацієнти з UUID
semantic_doctors (283) — лікарі з UUID
semantic_departments (49) — відділення з UUID
semantic_diagnoses (107,300) — діагнози з UUID
semantic_referrals (66,544) — направлення

РОЗКЛАДИ:

schedules (251) — графік чергувань:
  schedule_id, doctor_id, shift_date, shift_type (D/CALL24/EVENING), shift_start, shift_end, duration_hours

schedule (212) — архівний графік:
  doctor_name, shift_date, shift_type, hours, month, year

КЛАСИФІКАЦІЙНІ:

icd10_hierarchy (2,047) — ієрархія МКХ-10
icd10_level1_categories (24) — рівень 1 МКХ
icd_codes (3,049) — каталог МКХ кодів

ЗЯКИХ ТАБЛИЦЬ ОБИРАТИ:

✓ Госпіталізації → encounters, lsmd_staging, semantic_hospitalizations
✓ Пацієнти → patients, Patients (CRM), semantic_patients
✓ Лікарі → doctors, Doctors (CRM), semantic_doctors  
✓ Статистика діагнозів → Diagnoses, semantic_diagnoses, icd10_*
✓ География → Locations
✓ Розклад → schedules, schedule

ЗВ'ЯЗКИ:

encounters.patient_pk → patients.patient_pk
encounters.doctor_id → doctors.doctor_id
encounters.dept_admission_id → departments.department_id
semantic_hospitalizations.patient_id → semantic_patients.id
semantic_hospitalizations.doctor_id → semantic_doctors.id

ВАЖЛИВО:

- Відповідай ТІЛЬКИ валідним JSON без жодного тексту:
  {"sql": "SELECT ...", "explanation": "Короткий опис результату"}

- Тільки SELECT, без крапки з комою в кінці
- Для текстового пошуку: ILIKE '%термін%'
- Дати за 2025: admission_at >= '2025-01-01'
- Смерть: discharge_status = 'Помер'
- LIMIT 50 для списків, 1000 для агрегацій
- Коли не впевнений у структурі — використовуй INFORMATION_SCHEMA`

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
