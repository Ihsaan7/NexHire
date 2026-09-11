# NexHire Deployment Guide

This repository deploys to **one Vercel project**:

- Vite builds the frontend from `artifacts/job-aggregator`.
- Vercel serves the Express backend as a Node function at `/api/*`.
- `vercel.json` contains the build, output, routing, function, and header settings.

Nothing needs to be deployed as a second Vercel project.

## 1. Create the required accounts

Create these accounts before starting:

1. **Git provider** — push this repository to GitHub, GitLab, Bitbucket, or Azure DevOps.
2. **Vercel** — create an account at <https://vercel.com/signup> and connect the Git provider.
3. **MongoDB Atlas** — create an account at <https://www.mongodb.com/cloud/atlas/register>.
4. **Google AI Studio** — create or select a Google Cloud project and create a Gemini API key at <https://aistudio.google.com/apikey>.
5. **Clerk** — see the Clerk section below before creating or changing anything.
6. **A domain you own** — Clerk requires an owned domain for its production instance. A `*.vercel.app` address is not sufficient for Clerk production.

Never put secret values in this repository or paste them into support messages. Add them directly in Vercel's Environment Variables screen.

## 2. Prepare MongoDB Atlas

Use the existing Atlas project and cluster if they contain the application's current data and Vector Search index.

1. Open the Atlas project.
2. Under **Database Access**, create a dedicated database user for Vercel.
3. Give that user only the permissions needed by this application, normally `readWrite` for the application database.
4. Use a long, unique password.
5. Under **Network Access**, add `0.0.0.0/0`.
   - Vercel deployments use dynamic outbound IP addresses.
   - Atlas documents `0.0.0.0/0` for the standard Vercel integration.
   - Keep the database user credentials strong and private.
   - If the Vercel plan provides fixed outbound IPs or Secure Compute, restrict Atlas to those addresses instead.
6. Open the cluster's **Connect** dialog and select the Node.js driver.
7. Copy the `mongodb+srv://...` connection string.
8. Replace its username, password, and database name.
9. Save the completed value as `MONGODB_URI` in Vercel. Do not save it in a file.

For CV-to-job matching, verify that the existing Atlas Search index is still present:

- Name: `job_embedding_index`
- Field: `embedding`
- Dimensions: `3072`
- Similarity: `cosine`

If a brand-new Atlas cluster is used, its data and Vector Search index must be created before AI matching will work.

## 3. Prepare Clerk

### Current project status

This project currently uses a **Replit-managed Clerk tenant**. Accessing that tenant's Clerk dashboard requires an active personal Replit Pro subscription.

For Vercel, choose one of these options:

### Option A — keep the Replit-managed tenant

This requires an active personal Replit Pro subscription for managed Clerk dashboard access. If that access is unavailable, use Option B instead.

After access is available, use the managed tenant's Production environment, verify the owned production domain, and obtain its production publishable and secret keys through the authorized Replit-managed entry point.

### Option B — create an independent Clerk application

Use this if you cannot access the managed tenant or want Clerk to be independent of Replit.

1. Create your own Clerk account at <https://clerk.com/>.
2. Create a new application.
3. Configure the same sign-in methods the application should offer.
4. Create its Production instance.
5. Add the domain you own and complete Clerk's required DNS verification.
6. Copy the production keys:
   - Publishable key beginning with `pk_live_`
   - Secret key beginning with `sk_live_`

An independent Clerk application has a separate user store. Existing development or Replit-managed users are **not copied automatically**.

Do not use `pk_test_` or `sk_test_` keys for the public production deployment.

## 4. Import the repository into Vercel

1. Sign in to Vercel.
2. Select **Add New → Project**.
3. Import the Git repository.
4. Keep the project **Root Directory** at the repository root.
   - Do not select `artifacts/job-aggregator`.
   - Do not select `artifacts/api-server`.
5. Vercel will read the root `vercel.json`.
6. Note the project name.
7. Add the domain you own to the Vercel project and follow Vercel's DNS instructions.
8. Use the final HTTPS domain in the environment variables below.

## 5. Add Vercel environment variables

Open the Vercel project and go to **Settings → Environment Variables**.

Add these variables to the **Production** environment:

| Variable | Where to get it | Example format |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection dialog | `mongodb+srv://...` |
| `GEMINI_API_KEY` | Google AI Studio | A Gemini API key |
| `CLERK_PUBLISHABLE_KEY` | Clerk production instance | `pk_live_...` |
| `CLERK_SECRET_KEY` | Clerk production instance | `sk_live_...` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Same Clerk production instance | Same `pk_live_...` value |
| `CRON_SECRET` | Generate locally | A long random value |
| `PRODUCTION_ORIGIN` | Final frontend domain | `https://jobs.example.com` |
| `VITE_API_BASE_URL` | Same final domain | `https://jobs.example.com` |
| `VITE_CLERK_PROXY_URL` | Same domain plus Clerk proxy path | `https://jobs.example.com/api/__clerk` |

Generate `CRON_SECRET` locally:

```bash
openssl rand -hex 32
```

Copy the result directly into Vercel. Do not commit it.

Optional variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | API logging level |
| `USD_TO_PKR` | `278` | USD-to-PKR conversion |
| `ASSUMED_HOURS_PER_MONTH` | `80` | Monthly-hours estimate |

Do not add these manually:

- `NODE_ENV` — Vercel sets it.
- `PORT` — Vercel manages function ports; the frontend build value is already in `vercel.json`.
- `BASE_PATH` — the frontend build value is already in `vercel.json`.
- `VERCEL` — Vercel sets it.
- `REPL_ID` and `REPLIT_DEV_DOMAIN` — Replit-only variables.
- `DATABASE_URL` — the deployed application uses MongoDB; this is only for an unused shared PostgreSQL package.

### Preview deployments

Start with Production variables only. The backend intentionally allows one exact `PRODUCTION_ORIGIN`.

Preview deployments use different URLs, so authenticated API requests from arbitrary preview domains are not enabled by default. Do not copy production secrets into Preview unless a separate preview database, Clerk development instance, and explicit preview-origin policy have been prepared.

## 6. Trigger the first deployment

Before deploying, check that:

- The repository is pushed to the connected Git provider.
- The Vercel project root is the repository root.
- Every required Production variable above is present.
- `PRODUCTION_ORIGIN`, `VITE_API_BASE_URL`, and `VITE_CLERK_PROXY_URL` use the same final HTTPS domain.
- The Atlas database user and Network Access entry are active.
- Clerk's production domain and DNS are verified.

Then:

1. Return to the Vercel project deployment screen.
2. Select **Deploy**.
3. Wait for the install, frontend build, and function build to finish.
4. Open the deployed domain.
5. Check the public health endpoint:

```text
https://your-domain.example/api/health
```

It should return JSON containing:

```json
{
  "status": "ok",
  "db": "connected"
}
```

6. Create a new production Clerk account and complete onboarding.
7. Test CV upload, one AI action, job matching, and Practice.
8. Check Vercel's function logs if an API request fails.

Future pushes to the production branch, usually `main`, trigger new Production deployments automatically.

## 7. Scheduled synchronization

The protected synchronization endpoints are:

- `POST /api/cron/sync-adzuna`
- `POST /api/cron/sync-gigs`

They require this header:

```text
Authorization: Bearer YOUR_CRON_SECRET
```

The API uses Vercel's background-work support so a successful `202` response can continue processing within the configured function duration.

Do not put `CRON_SECRET` in a URL or expose it in frontend code.

## Node.js runtime

The project uses Node.js 24 to match Vercel's current build image. Keep the Vercel project's Node.js version aligned with the `engines.node` value in the root `package.json`.

## Official references

- Vercel Git deployments: <https://vercel.com/docs/deployments/git>
- Vercel environment variables: <https://vercel.com/docs/environment-variables>
- Express on Vercel: <https://vercel.com/docs/frameworks/backend/express>
- MongoDB Atlas and Vercel: <https://www.mongodb.com/docs/atlas/reference/partner-integrations/vercel/>
- Clerk deployment to Vercel: <https://clerk.com/docs/deployments/deploy-to-vercel>
- Gemini API keys: <https://ai.google.dev/gemini-api/docs/api-key>