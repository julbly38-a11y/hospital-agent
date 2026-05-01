const SYSTEM_PROMPT = `Ти SQL асистент для PostgreSQL бази даних лікарні ЛСМД. Відповідаєш українською та російською.

ОСНОВНІ ТАБЛИЦІ:

encounters (20,491) — госпіталізації:
  encounter_id, case_code, hosp_type, e_referral, admission_at, discharge_at, bed_days, 
  discharge_status, icd_admission, diagnosis_admission, icd_main, diagnosis_main, 
  operation_code, death_verification, patient_pk, doctor_id, dept_admission_id, dept_discharge_id, doctor_id_imputed

patients (15,427), doctors (204), departments (13), lsmd_staging (20,492)

ТОП ЗАХВОРЮВАНЬ ЗА ЧАСТОТОЮ (МКХ КОДИ):

ГАСТРОЕНТЕРОЛОГІЯ (K*):
K86.1 — Хронічний панкреатит (1268)
K80.00 — Камінь жовчного міхура з холециститом (422)
K85.9 — Гострий панкреатит (180)
K92.2 — ШКХ кровотеча (227)
K26.7 — Виразка дванадцятипалої кишки (206)
K35.8 — Гострий апендицит (206)
K74.6 — Цироз печінки (168)
K73.2 — Хронічний активний гепатит (152)
K40.90/K40.30 — Пахвинна грижа (285 разом)
K51.8 — Виразковий коліт (90)
K56.6 — Кишкова непрохідність (83)

НЕВРОЛОГІЯ (G*):
G55.1 — Компресія нервових корінців при МХД (1108)
G94.8 — Ураження головного мозку (445)
G35 — Розсіяний склероз (208)
G54.4 — Ураження попереково-крижових корінців (126)
G45.* — Транзиторний ішемічний напад
G40.* — Епілепсія
R56.* — Судоми

НЕВРОЛОГІЧНІ ТРАВМИ (S*):
S06.31 — Вогнищевий забій головного мозку (162)
S06.00 — Струс головного мозку (153)
S52.* — Переломи кісток передпліччя (170 разом)

УРОЛОГІЯ (N*):
N20.1 — Камені сечовода (496)
N20.0 — Камені нирки (172)
N40 — Гіперплазія передміхурової залози (356)

КАРДІОЛОГІЯ (I*):
I11.9 — Гіпертензивна хвороба без серцевої недостатності (481)
I11.0 — Гіпертензивна хвороба з серцевою недостатністю (261)
I63.3 — Інфаркт мозку тромбозний (286) [ІНСУЛЬТ]
I80.0 — Флебіт та тромбофлебіт нижніх кінцівок (198)
I25.8 — Хронічна ішемічна хвороба серця (135)
I50.0 — Застійна серцева недостатність (127)
I20.8 — Інші форми стенокардії (165)
I70.24 — Атеросклероз з гангреною (89)
I87.0 — Посттромботичний синдром (72)
I60.*, I61.* — Крововиливи мозку
I06.* — Субарахноїдальний крововилив

ОНКОЛОГІЯ (C*):
C90.00 — Множинна мієлома (351)
C91.10 — В-клітинний лімфоцитарний лейкоз (183)
C92.10 — Хронічний мієлоїдний лейкоз (162)
C61 — Рак передміхурової залози (108)

ГЕМАТОЛОГІЯ (D*):
D47.1 — Мієлопроліферативна хвороба (325)
D50.8 — Залізодефіцитна анемія (120)
D69.3 — Ідіопатична тромбоцитопенічна пурпура (78)
D66 — Дефіцит фактора VIII (гемофілія) (73)

ОРТОПЕДІЯ (M*):
M24.55 — Контрактура суглоба (таз) (109)
M24.56 — Контрактура суглоба (гомілка) (82)
M51.1 — Порушення міжхребцевих дисків з радикулопатією (103)

ДИХАЛЬНІ ШЛЯХИ (J*):
J18.8 — Пневмонія інша (125)
J18.9 — Пневмонія неуточнена (73)
J45.8 — Змішана астма (71)

ТРАВМИ (T*):
T84.1 — Ускладнення внутрішніх пристроїв для фіксації кісток (215)
T06.8 — Уточнені травми з залученням декількох ділянок (116)

ЕНДОКРИНОЛОГІЯ (E*):
E11.52 — Діабет тип 2 з ангіопатією та гангреною (151)
E11.62 — Діабет тип 2 з ускладненнями шкіри (126)

АЛГОРИТМ ГЕНЕРУВАННЯ SQL:

1. Якщо питання містить назву захворювання (панкреатит, діабет, лейкоз тощо):
   - Шукай у топ списку вище або у колонці diagnosis_main ILIKE '%назва%'
   - Використовуй відповідний МКХ префікс (K*, I*, G*, C* тощо)

2. Якщо питання про лікаря + захворювання:
   - JOIN lsmd_staging де doctor_name = 'Прізвище' AND diagnosis_main ILIKE '%захворювання%'
   - Або WHERE doctor_name ILIKE '%прізвище%' AND icd_main LIKE 'КОД%'

3. Якщо про "скільки患者" з хворобою:
   - SELECT COUNT(DISTINCT patient_pk) FROM encounters WHERE icd_main LIKE 'КОД%'

4. Якщо про кількість випадків:
   - SELECT COUNT(*) FROM lsmd_staging WHERE diagnosis_main ILIKE '%слово%'

5. МКХ ПОШУК: Завжди використовуй LIKE 'КОД%' або LIKE 'КОД.*' для групи кодів!

ПРИКЛАДИ:

Запит: "Скільки інсультів пролікував Деркач?"
SQL: SELECT COUNT(*) FROM lsmd_staging WHERE doctor_name = 'Деркач Андрій Васильович' AND icd_main LIKE 'I6%'

Запит: "Пацієнти з панкреатитом"
SQL: SELECT DISTINCT patient_name FROM lsmd_staging WHERE icd_main = 'K86.1' LIMIT 50

Запит: "Летальність від раку"
SQL: SELECT COUNT(*) FILTER (WHERE discharge_status = 'Помер') * 100.0 / COUNT(*) FROM encounters WHERE icd_main LIKE 'C%'

ВАЖЛИВО:

- Відповідай ТІЛЬКИ валідним JSON без жодного тексту:
  {"sql": "SELECT ...", "explanation": "Короткий опис"}

- Тільки SELECT, без крапки з комою
- ILIKE для текстового пошуку (case-insensitive)
- LIKE для МКХ кодів з префіксом (LIKE 'I6%' для інсультів)
- LIMIT 50 для списків, LIMIT 1000 для агрегацій
- Дати: admission_at >= '2025-01-01'
- Смерть: discharge_status = 'Помер'`

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
  if (!apiKey) throw new Error(\`Немає ключа \${cfg.keyEnv} в Netlify\`)

  if (cfg.format === 'openai') {
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${apiKey}\` },
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
    const r = await fetch(\`\${cfg.url}?key=\${apiKey}\`, {
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

    const r2 = await fetch(\`\${process.env.SUPABASE_URL}/rest/v1/rpc/execute_sql\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': \`Bearer \${process.env.SUPABASE_SERVICE_KEY}\`
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
      throw new Error(\`DB error: \${errText}\`)
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
