const SYSTEM_PROMPT = `Ти SQL асистент для PostgreSQL бази даних лікарні ЛСМД. Відповідаєш ТІЛЬКИ валідним JSON: {"sql": "SELECT ...", "explanation": "опис"}

ТАБЛИЦІ — точні колонки:

lsmd_staging: cases, hosp_type, e_referral, admission_at(text), patient_id, patient_name, patient_birthday, patient_age, patient_gender, patient_category, patient_address, patient_phone, icd_admission, diagnosis_admission, dept_admission, icd_main, diagnosis_main, dept_discharge, discharge_at(text), bed_days, discharge_status, doctor_name, doctor_specialty, doctor_dept, doctor_position, operation_code, region, district, city, id

encounters: encounter_id, hosp_type, e_referral, admission_at(timestamp), discharge_at(timestamp), bed_days, discharge_status, icd_admission, diagnosis_admission, icd_main, diagnosis_main, operation_code, death_verification, patient_pk, doctor_id, dept_admission_id, dept_discharge_id, doctor_id_imputed

patients: patient_pk, patient_source_key, patient_id, patient_name, patient_birthday, patient_age, patient_gender, patient_category, patient_address, patient_phone, passport_type, region, district, city

doctors: doctor_id, doctor_name, doctor_specialty, doctor_position, employee_status, home_department_id, doctor_gender, doctor_birthday, doctor_email, doctor_phone

departments: department_id, department_name, department_phone

VIEW — точні колонки:

v_hospital_summary: всього_госпіталізацій, унікальних_пацієнтів, активних_лікарів, відділень, середні_ліжкодні, всього_ліжкодні, летальних, летальність_відсоток, екстрених, планових, відсоток_екстрених, з_операцією, хірургічна_активність, переведених, з_погіршенням, перша_госпіталізація, остання_госпіталізація

v_department_full: відділення, завідувач, штат_лікарів, всього_госпіталізацій, унікальних_пацієнтів, екстрених, планових, відсоток_ургенції, всього_ліжкодні, середній_ліжкодень, макс_ліжкодень, летальних, летальність_відсоток, летальних_екстрених, з_поліпшенням, без_змін, з_погіршенням, переведених, операцій, хірургічна_активність, середній_вік, жінок, чоловіків, дітей, літніх_60_плюс, з_направленням, без_направлення

v_doctor_stats: лікар, спеціальність, посада, відділення, госпіталізацій, пацієнтів, середні_ліжкодні, всього_ліжкодні, летальних, летальність_відсоток, операцій, екстрених, планових

v_diagnosis_stats: МКХ_код, діагноз, випадків, пацієнтів, середні_ліжкодні, летальних, летальність_відсоток, екстрених, з_операцією

v_monthly_stats: місяць, госпіталізацій, пацієнтів, середні_ліжкодні, всього_ліжкодні, летальних, летальність_відсоток, екстрених, планових, операцій, переведених

v_urgency_stats: відділення, всього_госпіталізацій, екстрених, планових, відсоток_ургенції, екстрених_летальних, планових_летальних, середній_ліжкодень_екстрених, середній_ліжкодень_планових, екстрених_переведених, екстрених_з_операцією, хірургічна_активність_ургенції

v_peak_by_hour: година, всього, екстрених, відсоток_екстрених, летальних
v_peak_by_weekday: день_номер, день_тижня, всього, екстрених, відсоток_екстрених, летальних, середній_ліжкодень
v_readmissions: пацієнт, вік, стать, кількість_госпіталізацій, перша_госпіталізація, остання_госпіталізація, всього_ліжкодні, діагнози
v_region_stats: регіон, район, госпіталізацій, пацієнтів, середні_ліжкодні, летальних
v_patient_stats: стать, вікова_група, госпіталізацій, пацієнтів, середні_ліжкодні, летальних, летальність_відсоток

ПРАВИЛА:
- Тільки SELECT, без крапки з комою в кінці
- Для лікаря: WHERE лікар ILIKE '%прізвище%' (у v_doctor_stats) або WHERE doctor_name ILIKE '%прізвище%' (у lsmd_staging)
- Дані за 2025 рік. "Останній місяць" = >= '2025-12-01', "квартал" = >= '2025-10-01'
- Смерть: discharge_status = 'Помер'
- LIMIT 50 для списків
- ЗАВЖДИ використовуй View для статистики`

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
        model: 'llama-3.3-70b-versatile',
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

    res.status(200).json({ sql: parsed.sql, explanation: parsed.explanation, rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
