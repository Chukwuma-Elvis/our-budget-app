# Budget Tracker — Execution Plan (v2)

**Changes from v1:** shared account for 2 users with an attributed ledger; single currency (Naira ₦); no rollover, overdraft allowed and shown in red; hosted on Vercel (which changes the backend choice, see §2).

## 1. Overview

A web app for **two people sharing one account** to set monthly budgets per category, log purchases against those categories, and review spending by category and by month. Every recorded expense appears in a **ledger** showing the item, category, amount, date and **who added it**. Previous months stay available as history.

### Core requirements
| # | Requirement |
|---|-------------|
| R1 | Add and remove categories |
| R2 | Set a budget for each category (per month) |
| R3 | Logging page: item name, price (₦), category, date |
| R4 | Logged cost is deducted from that category's budget (remaining = budget − spent) |
| R5 | Page showing total spending by category |
| R6 | Page showing total monthly spending |
| R7 | Previous months' records remain available |
| R8 | **Two users share one account** and see the same data |
| R9 | **Ledger** listing every expense with category and the name of the user who added it |
| R10 | **Overdraft allowed:** spending can exceed budget; the category's spent figure turns **red** |
| R11 | Currency is **Naira (NGN, ₦)** only |
| R12 | **No rollover:** each month starts fresh; unspent budget does not carry over |
| R13 | Hosted on **Vercel** |

### Extras (kept)
- Overspend warning at 80% used (amber) and over 100% (red)
- Edit/delete logged items, with an audit trail
- "Copy last month's budgets" button for a new month
- Recurring expenses (rent, subscriptions) via Vercel Cron
- Search, filter by user/category/date, sort the ledger
- CSV export
- Charts (donut by category, bar by month)
- Per-user breakdown ("who spent what" this month)
- Light/dark theme, mobile-friendly layout

*Dropped from v1:* rollover, multi-currency, income tracking (can be added later).

---

## 2. Tech Stack (revised for Vercel)

Vercel runs serverless functions, not a long-running server, so a separate Fastify/Docker backend is a poor fit. The plan moves to a single full-stack framework deployed as one Vercel project.

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js 15 (App Router) + TypeScript** | First-class Vercel support; UI and API in one repo; server components for fast report pages |
| Backend | **Next.js Route Handlers / Server Actions** | Serverless API without a separate server |
| Database | **PostgreSQL on Neon** (via Vercel Marketplace) | Required Postgres; serverless-friendly pooling; free tier |
| ORM / migrations | **Prisma** with Neon's pooled connection string | Type-safe, versioned migrations |
| Validation | **Zod** | Shared by forms and API |
| Auth | **Auth.js (NextAuth) credentials provider** for name/phone + password, plus **WebAuthn passkeys** (via SimpleWebAuthn) for fingerprint / face unlock; argon2 password hashes | No email or SMS service needed, so it stays on free plans |
| Styling / UI | **Tailwind CSS + shadcn/ui** | Fast, accessible components |
| Charts | **Recharts** | |
| Forms | **React Hook Form + Zod resolver** | |
| Data fetching | Server components + **TanStack Query** for interactive pages | |
| Scheduled jobs | **Vercel Cron** hitting a protected route | Generates recurring expenses daily |
| Testing | **Vitest**, **Playwright** | |
| CI/CD | **GitHub → Vercel** (preview deploy per PR, production on `main`); GitHub Actions for lint/test and `prisma migrate deploy` | |

### Hosting notes (Vercel)
- Env vars set in Vercel: `DATABASE_URL` (pooled), `DIRECT_URL` (for migrations), `AUTH_SECRET`, `CRON_SECRET`, `SETUP_CODE` (only needed until the first account exists), `APP_TIMEZONE=Africa/Lagos`.
- Run migrations in the build/deploy step, not at request time.
- Keep Prisma client as a singleton to avoid exhausting connections in serverless.
- Vercel Hobby cron runs at most once per day, which is enough for recurring expenses.
- Region: choose the closest to the Neon database (e.g. Europe) to keep latency low.

### Free-tier plan (decided)
Everything runs on free plans, with no custom domain.

| Service | Plan | Used for |
|---------|------|----------|
| Vercel | **Hobby (free)** | Hosting at `<project-name>.vercel.app`; personal, non-commercial use only |
| Neon | **Free** | PostgreSQL database |
| GitHub | **Free** | Repo, CI via GitHub Actions |

Constraints to design around:
- **Cron:** Hobby allows at most one run per day, and it may fire at any point within the scheduled hour. Recurring expenses are created by a daily job that also catches up on any missed days (it processes every item whose `next_run_on` is on or before today).
- **Function limits:** Hobby functions have short execution time limits, so no heavy work in a request. Reports are SQL aggregates, and the ledger is paginated.
- **Neon cold starts:** the free database suspends after inactivity, so the first request after idle time can be slow by a second or two. Show loading states and don't treat this as an error.
- **Neon storage cap (about 0.5 GB):** plenty for two people logging expenses for years. Add a simple storage check to the Phase 6 launch checklist.
- **Backups:** free Neon keeps only a short point-in-time restore window. The CSV export doubles as a manual backup, and the README asks for a monthly export.
- **Preview deployments:** each PR gets a preview URL. Point previews at a separate Neon branch so test data never touches real data.
- **No paid add-ons:** no Vercel Analytics, Postgres add-on, or email service. Invites are shared as a link copied by hand, so no email provider is needed.

---

## 3. Design Decisions

1. **One shared "account" (household).** All data hangs off `account_id`, not `user_id`. Both users read and write the same categories, budgets and expenses. Hard limit of **2 members**.
2. **Joining:** the first user registers and creates the account; they generate an **invite link/code** for the second user. After 2 members, further joins are refused.
3. **Ledger = the expenses table**, always showing `created_by` (user id → display name). Edits record `updated_by`. Deletions and edits are also written to an **audit log**, so the ledger can be trusted by both people.
4. **Money in Naira only.** Stored as `NUMERIC(14,2)`; displayed with `Intl.NumberFormat('en-NG', {style:'currency', currency:'NGN'})` → `₦12,500.00`. No currency column needed.
5. **Budgets are per category per month.** Changing this month never alters past months.
6. **No rollover.** A new month's budget starts at whatever is set for that month (or is copied from last month on request). Leftover or overspend from a prior month has no effect.
7. **Overdraft allowed.** Nothing blocks a purchase that exceeds budget. `remaining` can be negative and is displayed as `-₦3,000.00`. UI rule: **spent > budget → spent amount and progress bar render red**; 80–100% → amber; otherwise normal.
8. **Deduction is computed, not stored:** remaining = `budget − SUM(expenses in category and month)`. No running balance to drift.
9. **Categories are soft-deleted** (`archived_at`) so history stays correct; expenses use `ON DELETE RESTRICT`.
10. **Spending without a budget:** a category with no budget row for the month shows budget ₦0, so any spend there displays red (overdrawn).
11. **Dates:** `spent_on` is a `DATE`; month boundaries use `Africa/Lagos`. `created_at` is `TIMESTAMPTZ`.

---

## 4. Database Schema (PostgreSQL)

### `accounts`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default `gen_random_uuid()` |
| name | TEXT | NOT NULL (e.g. "Our Budget") |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |

### `users`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| account_id | UUID | FK → accounts.id, NOT NULL |
| phone | TEXT | UNIQUE, NOT NULL; stored in E.164 form (e.g. `+2348012345678`); the login identifier |
| display_name | TEXT | NOT NULL (the user's name, shown in the ledger) |
| password_hash | TEXT | NOT NULL (argon2); always set so there is a fallback when biometrics fail |
| failed_attempts | INT | NOT NULL, default 0 |
| locked_until | TIMESTAMPTZ | NULL; set after repeated failed password attempts |
| created_at | TIMESTAMPTZ | NOT NULL |

- Max-2-users-per-account enforced in the join service inside a transaction (count check), with a test for the race case.
- Names are not unique (they are display only); the **phone number is what identifies a user at login**.

### `passkeys` (biometric login)
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → users.id, ON DELETE CASCADE, NOT NULL |
| credential_id | TEXT | UNIQUE, NOT NULL |
| public_key | BYTEA | NOT NULL |
| counter | BIGINT | NOT NULL, default 0 |
| transports | TEXT[] | |
| device_label | TEXT | e.g. "Tecno phone" |
| created_at / last_used_at | TIMESTAMPTZ | |

### `auth_challenges`
Short-lived WebAuthn challenges and password-reset tokens (serverless functions have no shared memory, so these live in the database).

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → users.id, NULL for sign-in before the user is known |
| kind | TEXT | `passkey_register` / `passkey_login` / `password_reset` |
| value_hash | TEXT | challenge or token (hashed for reset tokens) |
| expires_at | TIMESTAMPTZ | NOT NULL (a few minutes; 1 hour for resets) |
| used_at | TIMESTAMPTZ | NULL until used |

### `invites`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| account_id | UUID | FK → accounts.id, NOT NULL |
| token_hash | TEXT | UNIQUE, NOT NULL |
| created_by | UUID | FK → users.id |
| expires_at | TIMESTAMPTZ | NOT NULL |
| used_at | TIMESTAMPTZ | NULL until used |

### `categories`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| account_id | UUID | FK, NOT NULL |
| name | TEXT | NOT NULL |
| color | TEXT | hex, for charts |
| archived_at | TIMESTAMPTZ | NULL = active (soft delete) |
| created_by | UUID | FK → users.id |
| created_at | TIMESTAMPTZ | NOT NULL |

- Unique partial index: `(account_id, lower(name)) WHERE archived_at IS NULL`

### `budgets` (one row per category per month)
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| account_id | UUID | FK, NOT NULL |
| category_id | UUID | FK → categories.id, NOT NULL |
| month | DATE | first day of month, CHECK day = 1 |
| amount | NUMERIC(14,2) | NOT NULL, CHECK ≥ 0 |
| updated_by | UUID | FK → users.id |
| created_at / updated_at | TIMESTAMPTZ | |

- Unique: `(category_id, month)`
- No `rollover` column (removed).

### `expenses` — the ledger
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| account_id | UUID | FK, NOT NULL |
| category_id | UUID | FK → categories.id, **ON DELETE RESTRICT**, NOT NULL |
| item_name | TEXT | NOT NULL |
| amount | NUMERIC(14,2) | NOT NULL, CHECK > 0 |
| spent_on | DATE | NOT NULL, default today (Lagos) |
| note | TEXT | |
| **created_by** | UUID | FK → users.id, NOT NULL — who logged it |
| updated_by | UUID | FK → users.id, NULL |
| recurring_id | UUID | FK → recurring_expenses.id, NULL if one-off |
| created_at / updated_at | TIMESTAMPTZ | |

- Indexes: `(account_id, spent_on DESC)`, `(category_id, spent_on)`, `(account_id, created_by, spent_on)`

### `expense_audit` (trust trail for the two users)
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| account_id | UUID | FK, NOT NULL |
| expense_id | UUID | not an FK, so it survives deletion |
| action | TEXT | `create` / `update` / `delete` |
| actor_id | UUID | FK → users.id |
| before / after | JSONB | snapshot of changed row |
| at | TIMESTAMPTZ | default `now()` |

### `recurring_expenses`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| account_id | UUID | FK, NOT NULL |
| category_id | UUID | FK, NOT NULL |
| item_name | TEXT | NOT NULL |
| amount | NUMERIC(14,2) | NOT NULL |
| frequency | TEXT | `weekly` / `monthly` / `yearly` |
| next_run_on | DATE | NOT NULL |
| active | BOOLEAN | default true |
| created_by | UUID | FK → users.id (credited as the expense's `created_by`) |

### Relationships
```
accounts 1 ──< users          (max 2)
accounts 1 ──< invites
accounts 1 ──< categories 1 ──< budgets        (one per month)
accounts 1 ──< expenses >── 1 categories
users    1 ──< expenses (created_by)
accounts 1 ──< recurring_expenses ──< expenses
accounts 1 ──< expense_audit
```

### Key derived queries
- **Month summary** (per category): `budget`, `spent`, `remaining = budget − spent`, `percent`, `overdrawn = spent > budget`.
- **Total monthly spending:** `SUM(amount)` grouped by month of `spent_on`.
- **Per-user spend in a month:** `SUM(amount)` grouped by `created_by`.
- **Ledger:** expenses joined to category name and user display name, ordered by `spent_on DESC, created_at DESC`, paginated.
- **Available months:** distinct months from `budgets` ∪ `expenses`.

---

## 5. API Design (Next.js route handlers, prefix `/api`)

All routes require a session and scope every query by the session's `account_id`.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/register` | Create account + first user (name, phone, password, setup code); closed once an account exists |
| POST | `/auth/join` | Join with invite token (name, phone, password); rejected if account has 2 users |
| POST | `/auth/passkey/register/options`, `/auth/passkey/register/verify` | Enrol this phone's fingerprint/face (signed-in users only) |
| POST | `/auth/passkey/login/options`, `/auth/passkey/login/verify` | Sign in with biometrics |
| GET/DELETE | `/auth/passkeys`, `/auth/passkeys/:id` | List / remove enrolled devices |
| POST | `/auth/password` | Change own password |
| POST | `/auth/reset` | Partner generates a reset link for the other member; the link sets a new password |
| POST | `/invites` | Generate invite link |
| GET | `/members` | The two users (names) |
| GET | `/categories` | List active categories |
| POST | `/categories` | Create |
| PATCH | `/categories/:id` | Rename / recolor |
| DELETE | `/categories/:id` | Archive |
| GET | `/budgets?month=YYYY-MM` | Budgets for a month |
| PUT | `/budgets/:categoryId/:month` | Set/update budget |
| POST | `/budgets/copy` | Copy `{from, to}` |
| GET | `/expenses?month=&categoryId=&userId=&q=&page=` | **Ledger** (includes `createdBy.displayName`, `category.name`) |
| POST | `/expenses` | Log item (`created_by` taken from session, never from the client) |
| PATCH | `/expenses/:id` | Edit (writes audit row) |
| DELETE | `/expenses/:id` | Delete (writes audit row) |
| GET | `/reports/summary?month=` | Per-category budget / spent / remaining / overdrawn |
| GET | `/reports/monthly?from=&to=` | Total per month |
| GET | `/reports/by-user?month=` | Spend per person |
| GET | `/reports/months` | Months with data |
| GET | `/export/expenses.csv?month=` | CSV |
| CRUD | `/recurring` | Recurring items |
| GET | `/cron/recurring` | Vercel Cron target, requires `CRON_SECRET` |

Error shape: `{ error: { code, message, fields? } }`. Amounts travel as strings (`"12500.00"`).

---

## 6. Frontend Pages (Next.js App Router)

| Route | Page | Contents |
|-------|------|----------|
| `/login`, `/register`, `/join/[token]`, `/reset/[token]` | Auth | Login offers **"Use fingerprint / face"** (passkey) as the main button, with phone number + password as the fallback. After the first password login the app prompts "Enable biometric login on this device?" |
| `/` | **Dashboard** | This month: total spent vs total budget, per-category bars (red when over), recent ledger entries |
| `/log` | **Log Expense** | Item, price (₦), category, date, note. Live hint: "₦X left in Groceries" (turns red and shows "over by ₦X" if it would overdraw; still allowed) |
| `/ledger` | **Ledger** | Every expense: date, item, category, amount, **added by (name)**; filter by user/category/month/search; edit/delete; CSV export |
| `/categories` | **Categories & Budgets** | Add/remove categories, set each budget for the selected month, "copy last month" |
| `/spending` | **Spending by Category** | Month picker; table + donut: budget, spent (red if over), remaining, % |
| `/monthly` | **Monthly Totals** | Bar chart + table of every month's total; click to open the month |
| `/history/[month]` | **Month Detail** | Read-only view of any past month |
| `/settings` | Settings | Display name, invite partner, theme, alert threshold |

A global **month selector** in the header drives all report pages.

---

## 6a. Onboarding

### First user (account creator)
1. Opens the `*.vercel.app` address and lands on `/register`.
2. Enters name, phone number, password and the **setup code**.
3. The server checks the code, confirms **no account exists yet**, then creates the account (default name "Our Budget") and the user in one transaction, and signs them in.
4. Prompt: "Enable fingerprint/face on this device?" (optional; the password keeps working).
5. A **setup checklist** appears on the Dashboard until completed or dismissed:
   - [ ] Add categories (one-tap suggested set, or start blank)
   - [ ] Set this month's budgets
   - [ ] Invite your partner
   - [ ] Log your first expense

### Suggested starter categories (all optional, editable, removable)
Food & Groceries · Transport · Rent · Utilities · Airtime & Data · Health · Family & Support · Savings · Miscellaneous. Each is created with a colour and a ₦0 budget until the user sets amounts.

### Second user
1. First user opens Settings → **Invite partner**, which creates a single-use link (`/join/<token>`) that expires after 3 days. Only a hash of the token is stored.
2. They share it by WhatsApp or SMS (copy button, plus the phone's share sheet).
3. The partner opens it and enters name, phone number and password, then is offered biometrics.
4. In one transaction the server checks the token is valid and unused and that the account has fewer than 2 members, creates the user, and marks the invite used.
5. Settings then shows both members and hides the invite button, since the account is full. If the partner is removed or the invite expires, the first user can generate a new one.

### Locking down registration
- `/register` requires `SETUP_CODE`, a private environment variable set in Vercel. It is never shown in the UI or sent to the client.
- Once any account exists, `/register` and `POST /auth/register` return "registration closed", and only invite links work.
- Failed setup-code attempts are rate-limited.
- After the first account is created, the `SETUP_CODE` variable can be removed from Vercel.

### Edge cases
- Invite link opened after it expired or was used → clear message and a prompt to ask for a new link.
- Phone number already registered → "already in use", without revealing whose.
- Two people open the same invite at once → the transaction lets only one succeed.
- First user abandons registration halfway → nothing partial is saved (single transaction).
- Partner forgets the password before ever enabling biometrics → first user generates a reset link.

---

## 7. Project File Tree

```
budget-tracker/
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── vercel.json                      # cron schedule
├── .env.example
├── .gitignore
├── README.md
├── EXECUTION_PLAN.md
├── .github/
│   └── workflows/ci.yml             # lint, typecheck, test, prisma migrate deploy
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                      # demo account with two users, categories, expenses (dev only, never run in production)
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Dashboard
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── reset/[token]/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── join/[token]/page.tsx
│   │   ├── log/page.tsx
│   │   ├── ledger/page.tsx
│   │   ├── categories/page.tsx
│   │   ├── spending/page.tsx
│   │   ├── monthly/page.tsx
│   │   ├── history/[month]/page.tsx
│   │   ├── settings/page.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── auth/register/route.ts
│   │       ├── auth/join/route.ts
│   │       ├── auth/passkey/{register,login}/{options,verify}/route.ts
│   │       ├── auth/passkeys/route.ts
│   │       ├── auth/password/route.ts
│   │       ├── auth/reset/route.ts
│   │       ├── invites/route.ts
│   │       ├── members/route.ts
│   │       ├── categories/route.ts
│   │       ├── categories/[id]/route.ts
│   │       ├── budgets/route.ts
│   │       ├── budgets/[categoryId]/[month]/route.ts
│   │       ├── budgets/copy/route.ts
│   │       ├── expenses/route.ts
│   │       ├── expenses/[id]/route.ts
│   │       ├── reports/{summary,monthly,by-user,months}/route.ts
│   │       ├── export/expenses.csv/route.ts
│   │       ├── recurring/route.ts
│   │       └── cron/recurring/route.ts
│   │
│   ├── components/
│   │   ├── layout/                  # Header, Nav, MonthPicker
│   │   ├── ui/                      # shadcn components
│   │   ├── charts/                  # CategoryDonut, MonthlyBar
│   │   ├── budget/                  # CategoryRow, SpendBar (red/amber/normal)
│   │   └── forms/                   # ExpenseForm, CategoryForm, BudgetInput
│   │
│   ├── lib/
│   │   ├── db.ts                    # Prisma singleton
│   │   ├── auth.ts                  # Auth.js config, session helpers
│   │   ├── webauthn.ts              # passkey options/verification (SimpleWebAuthn)
│   │   ├── phone.ts                 # normalise Nigerian numbers to E.164
│   │   ├── money.ts                 # Naira formatting/parsing
│   │   ├── dates.ts                 # month helpers (Africa/Lagos)
│   │   ├── status.ts                # normal | warning | overdrawn rule
│   │   └── errors.ts
│   │
│   ├── server/                      # business logic, kept out of route files
│   │   ├── accounts.service.ts      # register, join, 2-member limit
│   │   ├── categories.service.ts
│   │   ├── budgets.service.ts
│   │   ├── expenses.service.ts      # includes audit writes
│   │   ├── reports.service.ts
│   │   └── recurring.service.ts
│   │
│   ├── schemas/                     # Zod schemas shared by forms and API
│   └── hooks/                       # useMonth, useMembers
│
├── tests/
│   ├── unit/                        # money, dates, status, reports math
│   ├── api/                         # service/route tests against test DB
│   └── e2e/                         # Playwright
│
└── public/
```

---

## 8. Execution Phases

### Phase 0 — Setup (0.5 day)
- Create Next.js + TypeScript project, Tailwind, shadcn/ui, ESLint/Prettier.
- Create Neon database via Vercel; connect GitHub repo to Vercel; set env vars; confirm a blank deploy works.

### Phase 1 — Data layer & auth (2 days)
- Prisma schema for all tables; first migration; seed script.
- Auth.js credentials login (phone + password); register (creates account + user); invite generation; join flow with the 2-member limit.
- Onboarding: setup-code-protected registration that closes after the first account, starter categories, invite flow.
- Passkey (biometric) enrolment and login; password reset by the partner; lockout after repeated failed attempts.
- Session helper exposing `userId` and `accountId`; every service takes these as arguments.

### Phase 2 — Core services & API (2.5 days)
- Categories (soft delete), budgets (set/copy), expenses CRUD with `created_by` from session, audit writes.
- Ledger query with filters and pagination.
- Reports: month summary (with `overdrawn` flag), monthly totals, by-user, months list.
- Unit tests for Naira formatting, month boundaries (Lagos), remaining/overdraw logic; service tests for account isolation and the 2-member limit.

### Phase 3 — Frontend core (3 days)
- App shell, nav, month picker, auth pages, Dashboard setup checklist.
- Categories & Budgets page.
- Log Expense page with live remaining/over-budget hint.
- Ledger page showing **added-by name** and category.
- Dashboard.

### Phase 4 — Reports & history (1.5 days)
- Spending by Category (table + donut, red spent when over budget).
- Monthly Totals (bar chart + table).
- Month Detail for past months.

**MVP complete after Phase 4 (~9.5 days).**

### Phase 5 — Extras (2 days)
- Recurring expenses + Vercel Cron route.
- Per-user spending report, CSV export, audit-trail view, dark mode, 80% amber warning.

### Phase 6 — Hardening & launch (1.5 days)
- Playwright e2e: register → invite partner → add category → set budget → both users log items → ledger shows each name → overspend turns red → view previous month.
- Accessibility (red state must not rely on colour alone: also show "Over by ₦X" text/icon), empty/loading/error states, mobile layout.
- Test biometric login on the real phones (Android and/or iPhone) against the deployed `https` address; passkeys do not work over plain `http` except on `localhost`.
- Security pass: rate-limit login, secure cookies, authorization check on every route, cron secret check.
- Production deploy on Vercel Hobby at the free `*.vercel.app` address; confirm Neon free-tier storage and cold-start behaviour; do a first CSV export as a backup test.

**Estimated total: ~13 working days** for one developer.

---

## 9. Testing Strategy

| Level | Focus |
|-------|-------|
| Unit | Naira formatting, month boundary helpers, remaining/percent, status rule (normal / warning / overdrawn) |
| Service/API | Account isolation (another account's data never visible); third user cannot join; ledger shows the right `created_by`; edit/delete write audit rows; archived category keeps old expenses |
| E2E | Two-user flow described in Phase 6; switching to a past month; deleting a category keeps history |
| Edge cases | Expense on the 1st/last day of the month (Lagos time); spend in a category with no budget; budget of ₦0; exact-equal spend (not red); overspend then next month starts fresh; two users logging at the same time; duplicate category names |

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Serverless DB connection exhaustion | Neon pooled URL + Prisma singleton |
| Migrations failing mid-deploy | Run `prisma migrate deploy` in CI before promoting; keep migrations backwards compatible |
| Third person joining the account | Enforce limit in a transaction; invite tokens single-use and expiring |
| One user changing/deleting the other's entries unnoticed | Audit trail with actor and before/after snapshot |
| Month boundary off-by-one from time zones | All month logic in one `dates.ts` using Africa/Lagos, with tests |
| Cron limits on Vercel Hobby | Daily schedule is sufficient; job catches up on missed days |
| Neon free DB sleeps when idle | Loading states; accept a slow first request |
| Free tier has little backup history | Monthly CSV export; Neon point-in-time restore for short-term mistakes |
| Red state inaccessible to colour-blind users | Add text/icon ("Over by ₦X") alongside colour |
| Passkeys are tied to the site address; changing it later (e.g. adding a custom domain) invalidates them | Password always remains as a fallback; users re-enrol biometrics after any domain change |
| Phone number is not verified (no SMS on the free plan) | Joining requires a single-use invite; only the two members can ever exist; numbers are used for identity, not messaging |
| Locked out (forgotten password, lost phone) | The other member generates a reset link; passkeys can be removed and re-added from Settings |
| Password guessing | Argon2 hashing, attempt counter with temporary lockout, rate limiting |
| Float rounding on money | `NUMERIC` in DB, strings over the wire |

---

## 11. Definition of Done (MVP)

- [ ] Two users can share one account; a third cannot join
- [ ] First user can register only with the setup code, and registration closes afterwards
- [ ] Partner joins through a single-use invite link
- [ ] Sign in with phone number + password, and with fingerprint/face once enrolled on a device
- [ ] Locked-out user can be recovered by the partner's reset link
- [ ] Add and remove categories (history preserved)
- [ ] Set a budget per category per month
- [ ] Log an item with price (₦) and category; remaining budget updates immediately
- [ ] Overspending is allowed; spent amount and bar turn red when over budget
- [ ] Ledger lists every expense with category and the name of the user who added it
- [ ] Spending-by-category page works for any month
- [ ] Monthly totals page shows all months
- [ ] Previous months viewable; no rollover between months
- [ ] Deployed on Vercel with a Neon Postgres database
- [ ] Tests passing in CI

---

## 12. Remaining Open Questions
None.

*Decided:* either user can edit or delete the other's entries, and every change is recorded in the audit trail (`expense_audit`); copying last month's budgets is a manual button; hosting is entirely on free plans with the default `*.vercel.app` address and no custom domain.

---

## 13. Implementation Notes (as built)

Where the code differs from the plan above:

- **Sessions:** a signed JWT cookie via `jose` (30 days, httpOnly) instead of Auth.js. This keeps phone + password and passkey sign-in in one simple flow. Passwords use `@node-rs/argon2`.
- **Client data fetching:** a small `useFetch` hook (`src/lib/client.ts`) instead of TanStack Query.
- **UI:** hand-written Tailwind components instead of shadcn/ui.
- **Routes:** pages live in route groups `(app)` (signed-in) and `(auth)`; URLs are unchanged.
- **Members:** `GET /api/auth/me` returns the current user, both members, passkeys and whether an invite is possible, replacing the separate `/members` route.
- **Extra routes:** `POST /api/categories/starter` (suggested categories), `GET /api/audit` (change history), `POST /api/auth/reset/confirm` (use a reset link).
- **Seed script:** not included; the app starts empty and onboarding creates the data.
- **Deferred:** Playwright end-to-end tests, per-user dark-mode toggle (dark mode follows the device setting), and a configurable alert threshold (fixed at 80%).
