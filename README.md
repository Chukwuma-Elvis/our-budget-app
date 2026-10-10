# Budget Tracker

A shared household budget tracker in naira (₦) for two people. Set a monthly budget per category, log what you buy,
and see spending by category and by month. Every expense is recorded in a ledger with the name of who added it.

See [EXECUTION_PLAN.md](EXECUTION_PLAN.md) for the design.

**Stack:** Next.js (App Router) · TypeScript · PostgreSQL · Prisma · Tailwind CSS · Recharts · WebAuthn passkeys.

## Run locally

Requires Node 20+ and Docker (for the local database).

```bash
npm install
cp .env.example .env        # then edit the values (see below)
docker compose up -d        # PostgreSQL on localhost:5440
npx prisma migrate deploy   # create the tables
npm run dev                 # http://localhost:3000
```

For the bundled `docker-compose.yml` use:

```
DATABASE_URL="postgresql://budget:budget_dev_only@localhost:5440/budget_tracker"
DIRECT_URL="postgresql://budget:budget_dev_only@localhost:5440/budget_tracker"
```

Open `/register`, create the first account with your `SETUP_CODE`, then invite your partner from **Settings**.

```bash
npm test            # unit tests
npm run typecheck
```

## How it works

- **Two members per account.** The first person registers (needs `SETUP_CODE`; registration closes once an account
  exists). They send a single-use invite link to the second person. A third person cannot join.
- **Sign in** with phone number + password, or with fingerprint/face (passkeys) once enabled on a device. If someone is
  locked out, the other member creates a password reset link in Settings.
- **Budgets are per category per month.** No rollover; use *Copy last month's budgets* to start a new month.
- **Overdraft is allowed.** Spending past a budget is never blocked; the spent amount and bar turn red and show
  "Over by ₦X".
- **Removing a category archives it**, so past expenses and reports stay correct.
- **Audit trail.** Either member can edit or delete the other's entries; every create, edit and delete is recorded with
  who did it.
- **Recurring expenses** are created by a daily Vercel Cron job (`/api/cron/recurring`), which also catches up on any
  missed days.

## Deploy to Vercel (free plans)

1. Create a free **Neon** database. Copy its **pooled** connection string (`DATABASE_URL`) and **direct** connection
   string (`DIRECT_URL`).
2. Push this repo to GitHub and import it in **Vercel** (Hobby plan).
3. Set these environment variables in Vercel:

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | Neon pooled URL |
   | `DIRECT_URL` | Neon direct URL (used by migrations) |
   | `AUTH_SECRET` | long random string (`openssl rand -base64 32`) |
   | `SETUP_CODE` | private code for first registration (can be deleted afterwards) |
   | `CRON_SECRET` | long random string; Vercel Cron sends it automatically |
   | `WEBAUTHN_RP_ID` | your site's hostname, e.g. `our-budget.vercel.app` |
   | `WEBAUTHN_ORIGIN` | full origin, e.g. `https://our-budget.vercel.app` |

4. Deploy. The `vercel-build` script applies database migrations and builds the app.
5. Open the site, register with your setup code, and invite your partner.

Notes:
- Passkeys are tied to the site address. If you change the domain later, re-enable biometrics (passwords keep working).
- Use a separate Neon branch for Vercel preview deployments so test data never touches real data.
- The free Neon database sleeps when idle, so the first request after a quiet period can take a second or two.
- Back up regularly: **Ledger → Download CSV** exports your expenses.
