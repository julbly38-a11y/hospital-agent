import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SYSTEM_PROMPT = `Ти SQL асистент для PostgreSQL бази даних лікарні. Відповідаєш на питання українською та російською мовою.

Таблиці бази даних:

encounters (20491 рядків) — госпіталізації:
  encounter_id, case_code, hosp_type, admission_at (timestamp), discharge_at (timestamp),
  bed_days (integer), discharge_status, icd_admission, diagnosis_admission,
  icd_main, diagnosis_main, operation_code, death_verification,
  patient_pk, doctor_id, dept_admission_id, dept_discharge_id, doctor_id_imputed

patients (15427):
  patient_pk, patient_name, patient_age, patient_gender, patient_category, region, district, city

doctors (198):
  doctor_id, doctor_name, doctor_specialty, doctor_position, home_department_id

departments (14):
  department_id, department_name

schedules:
  schedule_id, doctor_id, shift_date, shift_type (D/CALL24/EVENING), duration_hours

Зв'язки:
  encounters.patient_pk → patients.patient_pk
  encounters.doctor_id → doctors.doctor_id
  encounters.dept_admission_id → departments.department_id

ВАЖЛИВО: Відповідай ТІЛЬКИ валідним JSON:
{"sql": "SELECT ...", "explanation": "Короткий опис"}

Правила:
- Тільки SELECT
- Пошук лікаря: doctor_name ILIKE '%прізвище%'
- Дані за 2025 рік. "Останній місяць" = admission_at >= '2025-12-01', "тиждень" = admission_at >= '2025-12-25'
- Смерть: discharge_status ILIKE '%помер%' OR discharge_status ILIKE '%смерт%' OR discharge_status ILIKE '%летальн%'
- Лікар в encounters: COALESCE(e.doctor_id, e.doctor_id_imputed)
- LIMIT 50 для списків`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { question, history = [] } = req.body
  if (!question) return res.status(400).json({ error: 'Немає питання' })

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const r1 = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [
        ...history,
        { role: 'user', content: question }
      ]
    })

    const raw = r1.content[0].text
    let parsed
    try { parsed = JSON.parse(raw) }
    catch { const m = raw.match(/\{[\s\S]*\}/); parsed = JSON.parse(m[0]) }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    const { data, error } = await supabase.rpc('execute_sql', {
      sql_query: parsed.sql
    })

    let rows = []
    if (!error && data) {
      rows = data
    } else {
      const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({ sql_query: parsed.sql })
      })
      if (resp.ok) rows = await resp.json()
    }

    res.status(200).json({ sql: parsed.sql, explanation: parsed.explanation, rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
