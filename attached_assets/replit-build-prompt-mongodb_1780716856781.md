# Replit Build Prompt — NexHire (MongoDB Stack)

Copy everything below this line into Replit's AI Agent and let it scaffold.

---

## PROJECT BRIEF

Build NexHire, a personal career platform for Pakistani professionals. The app pulls live job listings (government and private), matches them against the user's uploaded CV using AI, and shows step-by-step manual application instructions. **No auto-apply.** Single user for now (me), but built so I can add friends later via login.

**Hard rules:**
- Everything must be free — no paid APIs, no paid tiers
- Stack must be simple and low-maintenance
- UI must feel modern, sharp, animated (not generic AI-template look)
- CV and personal data must be stored securely
- Only show jobs from 2026 onwards — auto-delete expired listings

---

## TECH STACK (all free)

- **Framework:** Next.js 14 (App Router) with TypeScript
- **Styling:** Tailwind CSS + shadcn/ui + Framer Motion for animations
- **Database:** MongoDB Atlas (free M0 cluster, 512 MB) with Vector Search enabled
- **ORM:** Mongoose
- **Auth:** Auth.js (NextAuth v5) with MongoDB adapter — email/password + Google OAuth, no external auth service
- **AI Model:** Google Gemini 2.0 Flash via official API (free tier: 15 req/min, 1500/day)
- **Embeddings:** Google `text-embedding-004` (free via Gemini API) — for CV-to-job semantic matching, stored in MongoDB Vector Search index
- **Job Data Source (Phase 1):** Adzuna API (free, official, covers Pakistan) — register at developer.adzuna.com
- **Scheduled jobs:** Vercel Cron (free, 2 jobs) — for refreshing listings daily
- **Hosting:** Vercel (free Hobby tier) — connect via GitHub
- **PDF parsing for CV:** `pdf-parse` (Node package, free)
- **DOCX parsing for CV:** `mammoth` (free)

Do **not** use: Supabase, OpenAI, Pinecone, Claude API, paid file storage, or anything that requires a credit card.

---

## DATA MODEL (MongoDB Collections)

### `users` collection (managed by Auth.js)
```js
{
  _id: ObjectId,
  email: String,           // unique
  passwordHash: String,    // bcrypt
  name: String,
  image: String,
  emailVerified: Date,
  createdAt: Date
}
```

### `profiles` collection
```js
{
  _id: ObjectId,
  userId: ObjectId,        // ref users._id, indexed
  cvText: String,          // extracted plain text from uploaded CV (no PDF stored)
  cvEmbedding: [Number],   // 768-dim Gemini embedding
  cvUpdatedAt: Date,
  preferences: {
    sectors: [String],
    locations: [String],
    experienceLevel: String,
    minMatchScore: Number
  },
  createdAt: Date,
  updatedAt: Date
}
```

### `jobs` collection
```js
{
  _id: ObjectId,
  source: String,                // 'adzuna' | 'fpsc' | 'ppsc' | ...
  sourceJobId: String,           // original ID from source
  title: String,
  company: String,
  location: String,
  sector: String,                // 'government' | 'private-tech' | 'private-banking' | ...
  category: String,
  subcategory: String,
  description: String,
  requirements: String,
  qualifications: String,
  experienceLevel: String,       // 'fresh' | '1-3' | '3-5' | '5+' | 'senior'
  jobType: String,               // 'full-time' | 'part-time' | 'contract' | 'internship'
  salaryRange: String,
  postedDate: Date,
  deadline: Date,
  applyUrl: String,
  applicationSteps: [String],    // structured steps for manual apply
  embedding: [Number],           // 768-dim Gemini embedding of job description
  createdAt: Date
}
```
**Unique compound index:** `{ source: 1, sourceJobId: 1 }`
**Vector Search index** on `embedding` field (768 dimensions, cosine similarity)
**Regular indexes:** `sector`, `category`, `deadline`, `postedDate`

### `savedJobs` collection
```js
{
  _id: ObjectId,
  userId: ObjectId,
  jobId: ObjectId,
  status: String,          // 'saved' | 'applied' | 'interview' | 'rejected' | 'offer'
  notes: String,
  appliedAt: Date,
  createdAt: Date
}
```
**Unique compound index:** `{ userId: 1, jobId: 1 }`

---

## SECURITY MODEL (replacing Supabase RLS)

Since MongoDB doesn't have built-in row-level security, enforce in every API route:

1. **Every query that touches user data must filter by the authenticated `userId`** from the Auth.js session
2. Create a server-side helper: `getAuthedUserId(req)` that throws if no valid session
3. All mutations go through API routes — never expose direct DB access to client
4. Never trust `userId` from request body or query params — always pull from session

Example pattern:
```typescript
// app/api/saved-jobs/route.ts
import { auth } from '@/lib/auth';

export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });
  
  const savedJobs = await SavedJob.find({ userId: session.user.id });
  return Response.json(savedJobs);
}
```

---

## FILTER STRUCTURE (the "selection" UX)

Two-level filter system. User picks a top-level sector, then sub-category.

**Sectors:**

1. **Government**
   - Federal (FPSC)
   - Provincial (Punjab / Sindh / KPK / Balochistan / AJK)
   - Testing Services (NTS / PTS / OTS / ETEA)
   - Departments (Police / WAPDA / Railways / Education Boards)

2. **Private — Technology**
   - Software Development
   - Data / AI / Machine Learning
   - DevOps / Cloud
   - Cybersecurity
   - QA / Testing
   - UI/UX Design
   - Product Management

3. **Private — Banking & Finance**
   - Banking Operations
   - Accounting & Audit
   - Investment & Treasury
   - Fintech / Digital Banking

4. **Private — Engineering**
   - Civil / Mechanical / Electrical / Chemical / Petroleum / Energy

5. **Private — Healthcare**
   - Medical / Pharmacy / Nursing / Hospital Admin

6. **Private — Education**
   - School Teaching / University Faculty / Training & Tutoring / Edu Admin

7. **Private — Sales & Marketing**
   - Digital Marketing / Field Sales / Business Development / Content & Copywriting

8. **Private — Media & Creative**
   - Journalism / Graphic Design / Video & Animation / Social Media Management

9. **Private — Operations & Admin**
   - HR & Recruitment / Customer Service / Logistics / Office Administration

10. **NGO / Non-profit**

11. **Remote / International**

12. **Internships / Fresh Graduate**

**Secondary filters (apply on top of category):**
- Location (Karachi / Lahore / Islamabad / Rawalpindi / Faisalabad / Multan / Peshawar / Quetta / Remote / Other)
- Experience level (Fresh / 1–3 yrs / 3–5 yrs / 5+ yrs / Senior)
- Job type (Full-time / Part-time / Contract / Internship)
- Posted within (Today / This week / This month)
- Deadline (Urgent — within 3 days / This week / This month)
- Minimum AI match score (slider, default 60%)

Store this taxonomy in `/lib/taxonomy.ts` as a typed structure.

---

## CORE FEATURES

### 1. Onboarding
- Email/password signup via Auth.js Credentials provider (bcrypt password hashing)
- Optional Google OAuth via Auth.js Google provider
- CV upload (PDF or DOCX). Extract text with `pdf-parse` or `mammoth`. **Discard the original file.** Generate Gemini embedding from the extracted text. Store `cvText` and `cvEmbedding` in `profiles` collection.
- Quick preference setup — "what sectors interest you?" multi-select.

### 2. Dashboard (home page)
- Top: AI-matched jobs (top 10 by vector similarity to CV embedding, using MongoDB `$vectorSearch`)
- Below: Browse by category (the filter tree)
- Sidebar/filters: secondary filters
- Real-time search input at the top

### 3. Job detail page
For each job, show:
- Title, company/department, location, posted date, deadline (with countdown if urgent)
- Full description, requirements, qualifications
- **AI Match Analysis** (generated on-demand by Gemini): match score, top 3 strengths from CV, top 3 gaps, suggested CV tweaks
- **Step-by-step apply instructions** — structured template per source
- "Open application page" button → opens `applyUrl` in new tab
- "Mark as applied" / "Save for later" buttons

### 4. Tracker page
- All saved/applied jobs with status pipeline (Saved → Applied → Interview → Offer/Rejected)
- Notes field per job
- Deadline reminders

### 5. CV management
- View extracted CV text
- Re-upload to update (regenerates embedding)
- Optional: "AI suggestions to improve my CV" using Gemini

---

## DATA INGESTION

### Phase 1: Adzuna API integration

Create Vercel Cron Job at `/api/cron/sync-adzuna` running daily at 6 AM Pakistan time (`0 1 * * *` UTC):

```typescript
// 1. Authenticate cron with CRON_SECRET in Authorization header
// 2. Fetch jobs from Adzuna API: country=pk, paginate through results (max 50 pages)
// 3. For each job:
//    - Map Adzuna category to our sector/category taxonomy
//    - Generate Gemini embedding of `${title} ${description}`
//    - Upsert into jobs collection (use unique sourceJobId)
// 4. Delete jobs where deadline < today OR createdAt < 60 days ago
// 5. Log run summary
```

### Phase 2 (defer for now): FPSC + PPSC scrapers
Leave folder structure ready at `/lib/scrapers/` with a placeholder README. Don't build yet.

---

## AI MATCHING LOGIC

### On CV upload:
```typescript
// 1. Extract text from PDF/DOCX
// 2. Call Gemini text-embedding-004 → 768-dim vector
// 3. Save cvText + cvEmbedding to profiles collection
```

### On job ingestion:
```typescript
// 1. For each new job, generate embedding of `${title} ${description} ${requirements}`
// 2. Store in jobs.embedding (768-dim)
```

### On dashboard load — MongoDB Vector Search:
```typescript
const matches = await Job.aggregate([
  {
    $vectorSearch: {
      index: 'job_embedding_index',
      path: 'embedding',
      queryVector: profile.cvEmbedding,
      numCandidates: 100,
      limit: 20
    }
  },
  {
    $match: {
      $or: [
        { deadline: { $exists: false } },
        { deadline: { $gte: new Date() } }
      ]
    }
  },
  {
    $addFields: {
      matchScore: { $meta: 'vectorSearchScore' }
    }
  }
]);
```

### On job detail page (lazy, only when user opens it):
Call Gemini Flash with:
```
"Given this CV:
{cvText}

And this job posting:
{jobDescription}

Return ONLY valid JSON in this exact shape:
{
  \"matchScore\": <0-100>,
  \"strengths\": [<3 short bullets>],
  \"gaps\": [<3 short bullets>],
  \"suggestions\": [<2 actionable tweaks>]
}"
```

Cache the result in a `matchAnalyses` collection keyed by `{userId, jobId}` so we don't re-call Gemini for the same pair.

---

## UI / DESIGN DIRECTION

This is critical. Do **not** ship a generic Tailwind dashboard. Aim for editorial / modern fintech feel.

**Aesthetic principles:**
- Dark mode default, with a clean light option
- Typography: pair a distinctive serif display font (e.g., `Fraunces`, `Instrument Serif`, or `Editorial New`) with a clean sans (`Geist`, `DM Sans`, or `Satoshi`) — NOT Inter or Roboto
- Color palette: one bold accent (deep red, electric green, or warm amber) against a near-black/cream base. Avoid purple gradients.
- Generous whitespace. Asymmetric layouts where it makes sense.
- Subtle grain texture or noise overlay on backgrounds
- Sharp, thin borders (1px) instead of heavy shadows
- Cards have hover states that lift slightly with smooth easing

**Animations (Framer Motion):**
- Page transitions: fade + subtle upward slide
- Job cards: stagger-in on load (each card delays 50ms after the previous)
- Filter pills: smooth color/scale transition on select
- Match score: animated counter rolling up to its number
- Loading states: skeleton with shimmer, not spinners
- Buttons: scale to 0.97 on press with spring physics
- Modal/drawer for job detail: slides in from right on desktop, bottom on mobile

**Mobile-first.** Must work perfectly on phone. Bottom nav bar on mobile, sidebar on desktop.

---

## SECURITY REQUIREMENTS

- All API keys in `.env` — never committed (add `.env*` to `.gitignore`)
- Every API route validates Auth.js session before touching data
- All DB queries scoped to `session.user.id` — never trust client-supplied user IDs
- Passwords hashed with bcrypt (cost factor 12)
- HTTPS everywhere (Vercel handles this)
- Rate limit AI analysis endpoint (max 30 calls per user per hour) — use a simple in-memory map or MongoDB-backed counter
- Input validation on all forms with `zod` schemas
- Sanitize HTML rendered from scraped job descriptions with `isomorphic-dompurify`
- Don't log CV content or user emails to console
- CV files are **never persisted to disk** — parsed in memory, text saved to DB, original buffer discarded
- Auth.js `secret` env var generated with `openssl rand -base64 32`
- Add a clear privacy notice on signup: *"Your CV is parsed once and stored as text in your private account. The original file is discarded immediately. Your data is never shared or used for training."*

---

## ENVIRONMENT VARIABLES

```
# MongoDB
MONGODB_URI=mongodb+srv://...

# Auth.js
AUTH_SECRET=                  # generated with openssl rand -base64 32
AUTH_GOOGLE_ID=               # optional, for Google OAuth
AUTH_GOOGLE_SECRET=

# Gemini
GEMINI_API_KEY=

# Adzuna
ADZUNA_APP_ID=
ADZUNA_APP_KEY=

# Cron protection
CRON_SECRET=                  # generated with openssl rand -base64 32
```

---

## FOLDER STRUCTURE

```
/app
  /(auth)/login
  /(auth)/signup
  /(app)/dashboard
  /(app)/jobs/[id]
  /(app)/tracker
  /(app)/cv
  /(app)/settings
  /api/auth/[...nextauth]
  /api/cron/sync-adzuna
  /api/jobs/match
  /api/jobs/[id]/analyze
  /api/saved-jobs
  /api/cv/upload
/components
  /ui              (shadcn components)
  /jobs            (JobCard, JobFilters, MatchScore, etc.)
  /layout          (Nav, Sidebar, MobileNav)
/lib
  /mongodb         (connection + Mongoose models)
  /auth            (Auth.js config)
  /gemini          (embeddings + completion helpers)
  /scrapers        (placeholder for Phase 2)
  /taxonomy.ts     (sector/category mappings)
  /rate-limit.ts
/models            (Mongoose schemas: User, Profile, Job, SavedJob)
/types
```

---

## BUILD ORDER

1. Initialize Next.js 14 TypeScript project with Tailwind and shadcn/ui
2. Install dependencies:
   ```
   mongoose next-auth@beta @auth/mongodb-adapter @google/generative-ai 
   framer-motion pdf-parse mammoth zod cheerio lucide-react 
   isomorphic-dompurify bcryptjs
   ```
3. Set up MongoDB connection (with global cached connection pattern for Next.js)
4. Define Mongoose models for User, Profile, Job, SavedJob
5. Configure Auth.js with Credentials + Google providers, MongoDB adapter
6. Build auth pages (login, signup)
7. Build CV upload flow with PDF/DOCX text extraction and Gemini embedding
8. Set up MongoDB Atlas Vector Search index on `jobs.embedding` (768 dims, cosine)
9. Build Adzuna ingestion cron + initial backfill
10. Build dashboard with vector-search matched jobs
11. Build filters (sector/category tree + secondary filters)
12. Build job detail page with on-demand Gemini analysis (cached)
13. Build tracker page
14. Polish animations and mobile responsiveness
15. Deploy to Vercel, set env vars, test cron

After scaffolding, give me a clear README with:
- Step-by-step setup (MongoDB Atlas cluster creation + Vector Search index, Gemini API key, Adzuna keys, Auth.js secret generation)
- How to run locally
- How to deploy to Vercel
- Where each env var goes

---

## QUESTIONS TO ASK ME BEFORE BUILDING

If anything is ambiguous, ask before scaffolding. Otherwise, start with step 1 and walk me through each step, waiting for me to confirm before moving on.
