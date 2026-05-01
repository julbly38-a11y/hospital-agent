# ЛСМД — Медичний AI Асистент

Чат-інтерфейс для запитів до бази даних лікарні на природній мові.

**🌐 Сайт:** https://relaxed-heliotrope-2068c2.netlify.app

## Як запустити локально

```bash
npm install
cp .env.example .env.local
# заповни .env.local своїми ключами
npm run dev
```

Відкрий http://localhost:3000

## Деплой на Netlify

### 1. Завантаж на GitHub
```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/YOUR_USERNAME/hospital-agent.git
git push -u origin main
```

### 2. Підключи до Netlify
1. Зайди на https://netlify.com
2. "Add new site" → "Import an existing project"
3. Вибери GitHub репозиторій
4. Build command: `npm run build`
5. Publish directory: `.next`

### 3. Додай змінні середовища
У Netlify → Site settings → Environment variables:

```
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://wnyfrckxhwujsjcfxqou.supabase.co
SUPABASE_SERVICE_KEY=eyJ...  (Service Role Key, не anon!)
```

**Де взяти ключі:**
- Groq API key: https://console.groq.com/keys
- Gemini API key: https://aistudio.google.com/app/apikey
- OpenAI API key: https://platform.openai.com/api-keys
- Anthropic API key: https://console.anthropic.com/settings/keys
- Supabase Service Role Key: Dashboard → Settings → API → service_role

### 4. Натисни Deploy

## Как получить Supabase Service Role Key

1. https://supabase.com/dashboard/project/wnyfrckxhwujsjcfxqou/settings/api
2. Секция "Project API keys"
3. Скопируй **service_role** (не anon!)

## Tech Stack

- **Frontend:** Next.js 14, React 18
- **Backend:** Next.js API routes
- **Database:** Supabase (PostgreSQL)
- **AI Providers:** Groq, Google Gemini, OpenAI, Anthropic
- **Deployment:** Netlify
