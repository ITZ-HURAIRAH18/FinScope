# FinScope — Professional Audit Report

**Date:** 2026-10-23
**Auditor role:** Senior Full-Stack Engineer / Crypto Market Analyst / Quantitative Developer
**Scope:** Full codebase — frontend, backend/APIs, database, authentication, trading logic, configuration, deployment, data-provider integrations.

> All findings below were produced by reading the actual code **and** by executing the application locally (`next dev` smoke tests, direct API-provider probes). Every claim marked *verified* was reproduced during this audit. No mock data was used to reach conclusions.

---

## 1. Project Architecture Overview

### 1.1 What the project is

**FinScope** (`package.json` name: `finscope`) is a **paper-trading and market-intelligence dashboard** for cryptocurrencies and stocks:

- Real-time prices via **Binance WebSocket** (crypto) and **Finnhub WebSocket** (stocks).
- Virtual trading with a **$100,000 starting balance** (no real money, no exchange connectivity).
- Portfolio tracking, transaction history, watchlists, news feed, basic analytics.
- Auth via **NextAuth v4** (credentials + Google OAuth) with **email OTP verification**.
- PostgreSQL via **Prisma 5**, deployed target: **Vercel** (`vercel.json` cron config).

### 1.2 Technology stack (verified)

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 15.1.11 |
| UI | React 19 + TypeScript 5.7 | strict mode on |
| Styling | Tailwind CSS 3.4 + CSS variables design tokens | dark theme default |
| State | Redux Toolkit 2.5 (market/portfolio/theme) + TanStack Query 5 (declared, minimal usage) |
| Charts | lightweight-charts 4.2, recharts 2.15 |
| DB | PostgreSQL + Prisma 5.22 |
| Auth | next-auth 4.24 + bcryptjs + Prisma adapter (JWT strategy) |
| Realtime | `ws` (server), native browser WebSocket (client) |
| Email | nodemailer (SMTP, OTP + welcome) |
| Deploy | Vercel (serverless functions + cron) |

### 1.3 Runtime topology

```
Browser (client components, Redux store)
 ├─ WebSocket  ──► wss://stream.binance.com  (crypto tickers, 15 symbols)
 ├─ WebSocket  ──► Finnhub WS (stocks; key passed from NEXT_PUBLIC env)
 ├─ fetch ──────► /api/*  (Next.js route handlers, server-side)
 │                  ├─ Prisma ─► PostgreSQL (users, portfolio, transactions, watchlist)
 │                  ├─ CoinGecko public API (crypto prices, OHLC charts, fallback polling)
 │                  ├─ Finnhub REST (quotes, news)
 │                  └─ Yahoo Finance (stock OHLC)
 └─ Cron: Vercel ─► /api/cron/cleanup-unverified
```

### 1.4 Data-flow notes (important for later phases)

- **Crypto live prices**: Binance WS → Redux (`marketSlice`). Fallback: `/api/crypto-prices` → CoinGecko every 10 s per client when WS is down.
- **Crypto charts**: `/api/crypto-chart` → CoinGecko `/coins/{id}/ohlc`. **No API key required** (public tier, rate-limited).
- **Stock charts**: `/api/stock-chart` → Yahoo Finance chart API (no key).
- **Stock quotes/news**: Finnhub (key required).
- **Market-wide data** (not yet implemented in-app): CoinGecko `/global`, `/search/trending`, `/coins/markets`; Alternative.me Fear & Greed — **all verified reachable during this audit** (§6).

### 1.5 Build health (verified)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean, 0 errors |
| `npm run lint` | ⚠️ 9 warnings (0 errors): `no-img-element` ×6, `react-hooks/exhaustive-deps` ×3 |
| `npm run build` | ✅ succeeds (30 pages, First Load JS 105–234 kB) |
| Tests | ❌ **none exist** — no jest/vitest/playwright/cypress config anywhere |
| Git hygiene | ✅ `.env` is gitignored and **not tracked**; no secrets found in tracked files |

---

## 2. Findings — Critical

### C1 — Crypto chart volume data is fabricated with `Math.random()`
- **Files:** `app/api/crypto-chart/route.ts:93-98`
- **Verified:** `GET /api/crypto-chart?symbol=BTCUSDT&interval=1h` returns candles with `volume` values such as `2572.543662513269`, `3291.564925481702` — random floats.
- **Why it matters:** The UI renders these as a **volume histogram** on the price chart. This is invented market data presented as real. Any volume-based reading (confirmation of moves, volume spikes) is meaningless, and it directly violates the project's own "no fabricated data" requirement. Severity is *Critical* because it silently corrupts analysis in the primary user-facing chart.
- **Fix:** Remove the random generator. Source real volume from CoinGecko `/coins/{id}/market_chart` (`total_volumes`) aligned to candle timestamps, or **omit the volume series entirely** when the provider cannot supply it and label the chart accordingly ("Volume data unavailable from provider").

### C2 — Unauthenticated endpoint can delete user records
- **Files:** `app/api/cron/cleanup-unverified/route.ts:26-36`, `components/CleanupTrigger.tsx`
- **Verified:** `GET` correctly requires `Bearer CRON_SECRET` (returns 401), but **`POST` executes the deletion with no authentication at all** ("Allow POST for client-side triggering (no auth required)").
- **Why it matters:** Anyone can invoke a data-destruction operation. It only targets *unverified* users with expired tokens (window is small), so blast radius is limited today — but the pattern is dangerous and trivially weaponized against pending signups (e.g., script hammering it to delete accounts mid-registration). The `GET` response additionally **returns deleted users' email addresses** (`deletedUsers: ... email`) — PII leakage via a cron endpoint.
- **Fix:** Delete the unauthenticated `POST` handler (move client trigger to authenticated server action or drop it), require the cron secret for both methods, and stop returning emails in responses.

### C3 — Trade execution trusts client price and has a race condition (double-spend)
- **Files:** `app/api/trade/buy/route.ts:17-61`, `app/api/trade/sell/route.ts:17-78`
- **Why it matters:**
  1. **Client-supplied price:** `price` comes from the request body with only `> 0` validation. A crafted request executes fills at any price (e.g., buy 1000 BTC at $0.01). Even though funds are virtual, this corrupts balances, P&L, transaction history, and every downstream portfolio analytics feature.
  2. **TOCTOU race:** balance/holding checks run **outside** the `$transaction` using a stale read (`user.balance - total` computed from the earlier snapshot). Two concurrent buys each pass the check and both deduct from the same stale balance → negative balances / duplicated holdings. Reproducible by double-submitting the buy button.
- **Fix:** (a) Server-side price validation — fetch the current market price and reject fills deviating more than a small tolerance (e.g., ±2%) from it; (b) make checks atomic inside the transaction using conditional updates (`updateMany({ where: { id, balance: { gte: total } }, data: { balance: { decrement: total } } })` and abort when `count === 0`), or row locks via `SELECT … FOR UPDATE`.

### C4 — Middleware returns HTML with HTTP 200 for unauthenticated API calls
- **Files:** `middleware.ts:23-34`
- **Verified:** `GET /api/watchlist`, `/api/portfolio`, `/api/profile` with no session → **HTTP 200 + login-page HTML** (not 401 JSON).
- **Why it matters:** The route handlers themselves do check the session and would return proper 401 JSON, but the middleware intercepts first and rewrites to the sign-in page. API clients get `200 OK` with HTML — breaking every consumer that branches on status codes (including this app's own fetch error handling). It also creates a false sense of protection: security then depends on *every* handler remembering its own session check.
- **Fix:** Remove `/api/*` from the middleware matcher (route handlers own API auth and return correct status codes), or special-case API paths in the middleware to return `401` JSON directly. Verify every protected route has an internal `getServerSession` check.

---

## 3. Findings — High

### H1 — Finnhub API key exposed to unauthenticated callers and shipped in the client bundle
- **Files:** `app/api/finnhub/ws-token/route.ts`, `app/dashboard/page.tsx:44`, `app/stocks/[symbol]/page.tsx:41`, `lib/finnhub-websocket.ts`, `.env` (`NEXT_PUBLIC_FINNHUB_API_KEY`)
- **Verified:** `GET /api/finnhub/ws-token` with **no session** → `HTTP 200 {"token":"<FINNHUB API KEY>"}` (redacted in this report). Additionally the same key is bundled into client JS via `NEXT_PUBLIC_*`.
- **Why it matters:** Anyone can harvest the key and consume the quota (free tier = 60 calls/min; paid features cost money). `NEXT_PUBLIC_` vars are public **by design** — they cannot be a secret. Two exposure paths for one key.
- **Fix:** Keep `FINNHUB_API_KEY` server-only; make `/api/finnhub/ws-token` require a session (or return a short-lived signed token); route all client data needs through authenticated server proxies. Document that anything prefixed `NEXT_PUBLIC_` is public.

### H2 — No rate limiting or lockout on authentication endpoints; OTP is stored in plaintext
- **Files:** `app/api/auth/register/route.ts`, `app/api/auth/verify-email/route.ts` (POST/PUT/GET), `lib/auth.ts`, `lib/email.ts`
- **Verified in code:** the 6-digit OTP (`emailVerificationToken`) is stored **in plaintext** (README claims it is bcrypt-hashed — it is not), has a 10-minute window, and `POST /api/auth/verify-email` accepts unlimited attempts with no per-account attempt counter. `PUT` (resend) has no throttle → email bombing. `POST /api/auth/register` has no throttle → signup spam + SMTP abuse.
- **Why it matters:** 1,000,000 codes × unlimited attempts inside 10 minutes is practically brute-forceable, letting an attacker verify (and take over) any pending account. Absence of throttling enables quota/cost abuse of the SMTP provider and Finnhub/DB.
- **Fix:** (a) hash OTP with bcrypt before storing (compare-by-hash); (b) per-identifier attempt counter with lockout after ~5 failures; (c) sliding-window rate limits on register/verify/resend/login (in-memory per-instance + document serverless limitation); (d) resend cooldown ≥ 60 s.

### H3 — User enumeration across auth flows
- **Files:** `app/api/auth/register/route.ts:24-29` (`"User already exists"`), `app/api/auth/verify-email/route.ts:24-28` (404 "User not found"), `:154-157`
- **Why it matters:** An attacker can enumerate registered emails and probe verification status. Combined with H2 this assists targeted OTP brute force.
- **Fix:** Uniform responses ("If this email is available, a code has been sent"), and for already-registered users send a "you already have an account" email instead of an API error. Verification status responses must be identical for existing-unverified and non-existing emails.

### H4 — CoinGecko rate limits are unhandled and hit quickly (no caching/coalescing)
- **Files:** `app/api/crypto-prices/route.ts`, `app/api/crypto-chart/route.ts`, `lib/binance-websocket.ts:169-214` (10 s polling per client)
- **Verified:** CoinGecko public tier returned **`429 Too Many Requests` + `retry-after: 60`** after ~7 rapid requests in this audit; the chart route passes the 429 straight through (surfaced to users as "CoinGecko API error: 429"), and `crypto-prices` has **no cache at all** — every client fallback poll hits CoinGecko directly, 6 requests/minute/client on top of chart requests.
- **Why it matters:** The free public tier (~5–15 req/min, shared across all users of the deployment) is the *single* source for crypto prices and charts. Two users browsing charts will exhaust it and the dashboard silently degrades to stale/empty data.
- **Fix:** server-side cache (per symbol/days key) with TTL ≥ 30–60 s, in-flight request coalescing, `429` handling with `Retry-After` backoff and a clear "rate limited — showing cached data" state, plus conditional fallback to last-known-good data.

### H5 — Stale market data served as fresh (no data-age indicator anywhere)
- **Files:** `app/api/crypto-chart/route.ts:74` (`next: { revalidate: 60 }`), `app/api/crypto-prices/route.ts:84`
- **Verified:** `GET /api/crypto-chart?symbol=ETHUSDT&interval=1h` returned candles **ending 2026-04-05 (~6 months stale)** served with HTTP 200 (stale entry from the framework fetch cache), while a cache-busted request and direct CoinGecko calls returned fresh data ending 2026-10-23. No response field or UI element indicates data age; `lastUpdate: Date.now()` in `crypto-prices` is stamped at *serve* time, falsely implying freshness.
- **Why it matters:** In a financial product, silently stale prices are worse than an outage — users can act on them.
- **Fix:** never stamp `Date.now()` as the data timestamp (use the provider's timestamp), return `fetchedAt`/`staleness` metadata, force `cache: 'no-store'` or a verified short revalidate for live endpoints, and display "Updated Xs ago / Stale" in the UI with a warning banner past a threshold.

### H6 — Chart timeframe labels do not match the data (misleading charts)
- **Files:** `app/api/crypto-chart/route.ts:29-36`, `components/crypto/CryptoChart.tsx:247`
- **Verified by direct measurement:** for CoinGecko OHLC — `days=1` → **30-minute candles**, `days=7`/`days=30` → **4-hour candles**, `days=365` → **4-day candles**. The UI offers `1s, 1m, 5m, 15m, 1h, 1d` buttons, but `1s/1m/5m/15m` all fetch `days=1` (identical 30-min data), `1h` fetches `days=30` (4-hour candles), `1d` fetches `days=365` (4-day candles).
- **Why it matters:** Users reading "1m" candles that are actually 30-minute bars will misread volatility, patterns and indicator values. This is an accuracy bug in the core analysis surface.
- **Fix:** Derive the true candle interval from the returned timestamps, replace buttons with honest ranges (e.g., `1D / 7D / 1M / 3M / 1Y`), and display the actual candle interval next to the chart ("4h candles · 30 days"). Consider Binance klines (where reachable) for true intraday OHLCV with a documented geo-limitation fallback.

### H7 — Crypto detail page hangs forever on direct navigation
- **Files:** `app/crypto/[id]/page.tsx:21-26`
- **Why it matters:** The page renders `<LoadingScreen />` until Redux `cryptoPrices[symbol]` exists — but the Binance WS is only connected by the **dashboard** page. A user opening `/crypto/btc` directly (deep link, refresh, share) gets an **infinite loader** with no fetch fallback and no error path (the stock detail page, by contrast, has a 15 s timeout + fallback banner).
- **Fix:** connect/fetch price data on the detail page itself (or fetch a snapshot via `/api/crypto-prices` on mount), with loading → error → retry states.

### H8 — News category filter is cosmetic and the cache ignores query parameters
- **Files:** `app/api/news/route.ts:11-21,32`
- **Verified:** `GET /api/news?category=crypto` returns the **same articles** as `category=general` (Finnhub's `/news` only supports `general`/`merge` — there is no crypto category), and a single global cache entry keyed by nothing: the first request's `limit=2` response was served for a later `limit=5` request (verified: returned 2).
- **Why it matters:** UI claims (General/Crypto/Stock tabs) that don't exist server-side; users believe they're seeing filtered news when they are not. Wrong results served across categories/limits.
- **Fix:** key the cache on `category+limit`, stop sending unsupported categories to Finnhub, and implement filtering honestly — either keyword/`related`-symbol client-side filtering clearly labeled as such, or a provider with real crypto news (documented, key-required).

---

## 4. Findings — Medium

| # | Finding | Files | Fix |
|---|---|---|---|
| M1 | **Money stored as Prisma `Float`** (`balance`, `quantity`, `averageBuyPrice`, `price`, `total`) — binary floating-point drift in balances/P&L over many trades | `prisma/schema.prisma:23,85-86,101-102` | Migrate to `Decimal` (breaking; needs data migration) or enforce cent-precision rounding (`Math.round(x*1e8)/1e8`) consistently at every write; document the assumption meanwhile |
| M2 | **Duplicated code**: ~80 lines of `getCSSColor`/`hslToHex` copied between the two chart components; near-identical detail-page layouts; stats computed in 3+ places | `components/crypto/CryptoChart.tsx:14-80`, `components/stock/StockChart.tsx:14-80` | Extract `lib/chart-theme.ts` + shared detail layout components |
| M3 | **Watchlist check-then-create race** — duplicate insert throws P2002 → surfaces as generic 500 instead of idempotent success | `app/api/watchlist/route.ts:53-83` | Use `upsert` / catch `P2002` → 200 |
| M4 | **No tests whatsoever** (no unit/integration/e2e config; financial math untested) | repo-wide | Add vitest + tests for indicators, P&L, trade API (see roadmap) |
| M5 | **Logging**: raw `console.error` with no structure/request IDs; `console.log` in hot paths (WS connect logs full stream URLs) | all API routes, `lib/binance-websocket.ts:61` | Structured logger (level, route, requestId), strip dev logs from prod |
| M6 | **Accessibility**: table headers clickable only via `onClick` (no `tabIndex`, `role`, `aria-sort`), rows clickable but not keyboard-focusable; external `<img>` without dimensions/alt discipline; sortable column `name` implemented but never wired to a header | `components/markets/MarketTable.tsx:116-151,164-171` | Keyboard-operable headers (`<button>` inside `<th>` + `aria-sort`), focusable rows, alt text |
| M7 | **Stock page** uses a 15 s timeout fallback but no equivalent for crypto; `isDataLoaded` omitted from effect deps (lint warning) | `app/stocks/[symbol]/page.tsx:29-73` | Unify loading/staleness handling across asset types |
| M8 | **Images**: 6× `<img>` lint warnings (external FMP logos + avatars), 4.8 MB of screenshots committed under `public/images` incl. `Code.pdf` | multiple | `next/image` where sensible; move heavy assets out of the repo or compress |
| M9 | **Auth callback complexity**: Google account-linking performed inside `signIn` callback with multiple DB writes per login; `jwt` callback does DB reads on every `trigger === 'update'` | `lib/auth.ts:76-176` | Simplify/link once; cache; add tests |
| M10 | **Error contract inconsistency**: some routes return `{ error }`, others `{ message }`; upstream provider errors are proxied with upstream status codes (429/500 leak semantics) | API routes | Standard error envelope `{ error: { code, message } }`, map upstream codes to safe 502/429-with-retry metadata |

---

## 5. Findings — Low

| # | Finding | Files |
|---|---|---|
| L1 | README inaccuracies: claims OTP is bcrypt-hashed (it is not), claims "Database Indexes — optimized schema" (schema has **no** `@@index` beyond uniques), links to 6 docs (`QUICK_SETUP.md`, `EMAIL_VERIFICATION_SETUP.md`, `VERCEL_HOBBY_FIX.md`, `IMPLEMENTATION_SUMMARY.md`, `BUILD_FIX.md`, `OTP_UNIFICATION.md`) that **do not exist** in the repo | `README.md:456-464,676-693,799-808` |
| L2 | `.qwen/` (140+ agent prompt files) sits in the working tree — untracked, adds noise to every `git status` | `.qwen/` |
| L3 | ESLint warnings at build (9): `no-img-element`, `exhaustive-deps` | see §1.5 |
| L4 | `public/images/*.png` ~4.8 MB + `Code.pdf` committed; `dev-output.log` (empty) present | `public/images/` |
| L5 | Dead/unused sort path (`case "name"`), unused `sortField/sortOrder` globals partially superseded by local sort | `components/markets/MarketTable.tsx:42-46` |
| L6 | `dev-output.log`, `tsconfig.tsbuildinfo` present in worktree (ignored, but stale) | root |
| L7 | Landing/analytics/watchlist/news pages — see secondary-file audit addendum | `app/page.tsx`, `app/analytics/page.tsx`, … |

---

## 6. Data-provider verification (Phase 5 evidence)

All probes executed 2026-10-23 from the audit environment:

| Provider / endpoint | Purpose | Result |
|---|---|---|
| Binance `GET /api/v3/ticker/24hr` | crypto 24h ticker | ✅ 200 |
| Binance WS `stream.binance.com:9443` | live tickers (client) | not testable server-side; REST verified |
| CoinGecko `/coins/{id}/ohlc` | crypto candles | ✅ 200, granularity 30min(1d)/4h(7–30d)/4d(365d) |
| CoinGecko `/coins/markets` | prices/fallback | ✅ 200 |
| CoinGecko `/global` | total mcap, dominance | ✅ 200 (`total_market_cap.usd`, `market_cap_percentage.btc/eth`) |
| CoinGecko `/search/trending` | trending coins | ✅ 200 (15 items) |
| CoinGecko `/coins/{id}/market_chart` | real volume series | ✅ shape `{prices, total_volumes}` (also rate-limited) |
| **CoinGecko rate limit** | — | ⚠️ **429 + `retry-after: 60` after ~7 calls/min** (free public tier) |
| Alternative.me `/fng/?limit=7` | Fear & Greed Index | ✅ 200, latest value 50 "Neutral", 7-day history |
| Yahoo Finance `/v8/finance/chart` | stock OHLC | ✅ 200 |
| Finnhub `/quote`, `/news` | stock quotes/news | ✅ valid (401 without key — key present in `.env`) |
| Finnhub `/news?category=crypto` | "crypto news" | ❌ **not a supported category** — returns general news |
| Cloudinary | avatar upload | configured in `.env` (not exercised during audit) |
| SMTP (nodemailer) | OTP emails | configured in `.env` (not exercised during audit) |

**Operational cost notes (verifiable):** Binance WS, CoinGecko public tier, Yahoo Finance, Alternative.me F&G = **free** (CoinGecko free tier is rate-limited, ~5–15 req/min; a paid CoinGecko plan starts around $79/mo for higher limits). Finnhub free tier = 60 calls/min (paid from $49.95/mo if more is needed). Cloudinary free tier = 25 GB storage. All current functionality can run **$0/mo** if caching (H4) is implemented correctly.

---

## 7. Top 10 weaknesses (ranked by severity × impact)

| Rank | Weakness | Severity | Finding |
|---|---|---|---|
| 1 | Fabricated chart volume (`Math.random()` shown as real volume) | Critical | C1 |
| 2 | Trade fills trust client-supplied price + balance race (double-spend) | Critical | C3 |
| 3 | Unauthenticated destructive cleanup endpoint + PII in response | Critical | C2 |
| 4 | **Profile save broken for every user with an existing avatar URL** (base64-only regex → 400 on name-only edits) | Critical | S1 |
| 5 | **Watchlist star button permanently broken** (`.some()` on `{watchlist}` object → silent TypeError; mutations ignore `response.ok`) | Critical | S2 |
| 6 | Middleware returns 200 HTML instead of 401 for protected APIs | Critical | C4 |
| 7 | Finnhub key exposed via unauth endpoint **and** bundled in client JS | High | H1 |
| 8 | Auth unthrottled + OTP from `Math.random()`, stored plaintext, no attempt limit | High | H2 + S3 |
| 9 | CoinGecko 429s unhandled / no caching; stale data served as fresh | High | H4 + H5 |
| 10 | Watchlist & portfolio pages never open a data stream → direct loads show "Loading…"/`-` P&L forever | High | S4 |

*(Runner-ups: H6 timeframe labels, H7 crypto-detail hang, OTP verification dead-end S5, fake news filtering H8, fabricated landing-page sparklines S6, Float money M1, zero tests M4.)*

---

## 8. Recommended target architecture

```
app/
 ├─ api/                        # Route handlers = single security boundary
 │   ├─ (rate-limited) auth/*   # register/verify/resend/login throttled + OTP hashed
 │   ├─ market/                 # NEW: /global, /trending, /movers — cached, coalesced
 │   ├─ coins/[id]/analysis     # NEW: OHLC + computed indicators (server-side, cached)
 │   ├─ crypto-chart|prices     # fixed: real volume or none, no-store, fetchedAt, 429 backoff
 │   └─ … existing routes       # internal session checks; uniform error envelope
lib/
 ├─ coingecko.ts                # single HTTP client: TTL cache, request coalescing, Retry-After
 ├─ indicators.ts               # pure functions: SMA/EMA/RSI/MACD/Bollinger/S-R/volatility (unit-tested)
 ├─ rate-limit.ts               # sliding-window limiter (per-IP + per-identifier)
 └─ logger.ts                   # structured logs, no secrets
components/
 └─ chart/MarketChart.tsx       # ONE chart component (candle/line, overlays, honest timeframes)
prisma/schema.prisma            # + Alert model, @@index on (userId), Decimal migration path
docs/                           # audit, setup, env, indicator methodology, roadmap
```

Principles: route handlers enforce authz (middleware only for pages); one upstream-HTTP layer owns caching/rate limits; all computed indicators are pure, documented functions with tests; every price surface shows **source + last-updated**.

---

## 9. Implementation roadmap (summary — full detail in `docs/ROADMAP.md`)

**Phase A — Essential fixes (this session):** C1–C4, H1–H6, H8, M3, M6 (table a11y).
**Phase B — UI/UX upgrade:** unified chart component with honest timeframes + candle/line toggle + indicator overlays, loading/empty/error/stale states, data-source & last-updated labels, keyboard accessibility, responsive polish.
**Phase C — Market analysis:** market overview (mcap, dominance, trending, movers, Fear & Greed), per-coin indicators (RSI/SMA/EMA/MACD/Bollinger/support-resistance/volatility) with documented methodology, comparison/screener.
**Phase D — Differentiators (ranked):** price alerts (DB + cron + email) › coin comparison › custom screener › risk analytics › personalized dashboard › market-regime tagging › backtesting › AI research assistant (requires an LLM key; last because of cost/verification needs).
**Phase E — Hardening/tests/docs:** auth + trade API tests, indicator tests against known fixtures, load/rate-limit verification, production env docs.

---

---

## 10. Addendum — Secondary-file audit (auth UI, profile/news/analytics/watchlist/portfolio pages, store, config)

> Full evidence per file is preserved in the audit working notes; this section lists every confirmed finding. Items marked ✅ are verified working.

### 10.1 Critical (confirmed by direct code read)

| ID | Finding | Files |
|---|---|---|
| S1 | **Profile update fails for users with existing avatar URLs.** Server validates `image` with `/^data:image\/…base64,/` and returns 400 for anything else; the page always sends `image` initialized from `session.user.image` (Cloudinary/Google `https://…` URLs) → saving just the name fails 100% of the time for those users. Also: old Cloudinary asset is deleted **before** the new upload succeeds (avatar lost on failure), no server-side payload size cap, `name` unvalidated. | `app/api/profile/route.ts:57-88`, `app/profile/page.tsx:24,57-60` |
| S2 | **Watchlist membership check always fails.** `GET /api/watchlist` returns `{ watchlist: [...] }` but the button calls `watchlist.some(...)` on that object → `TypeError` swallowed by `catch` → `isInWatchlist` can never be `true`; already-saved items still show "Add". POST/DELETE results are never checked with `response.ok` → UI flips state even when the API rejected the change. Every button also fetches the entire watchlist on mount (N+1). | `components/watchlist/WatchlistButton.tsx:24-69` |

### 10.2 High

| ID | Finding | Files |
|---|---|---|
| S3 | **OTP generated with `Math.random()`** (`100000 + Math.random()*900000`) — non-cryptographic PRNG for email verification; `crypto` is imported but never used. (Pairs with H2: plaintext storage + no attempt limit + no throttle.) | `lib/email.ts:17` |
| S4 | **Watchlist and portfolio pages never open any WebSocket** (only dashboard/landing/analytics call `.connect()`) → direct navigation: every watchlist price cell stuck on "Loading…", portfolio **Current/Value/P&L/P&L % all render `-`** — the page's core purpose shows nothing. Portfolio `error` is never rendered, so a failed fetch shows the *"You don't have any holdings yet"* empty state (wrong information). `plPercent` divides by zero → `+Infinity%`/`NaN%` possible. | `app/watchlist/page.tsx:25`, `app/portfolio/page.tsx:69-136`, `store/slices/portfolioSlice.ts` |
| S5 | **OTP verification dead-end.** Verify + Resend buttons are disabled whenever `timeLeft === null \|\| <= 0`; if the initial timer GET fails, `timeLeft` stays `null` forever → both buttons permanently disabled, no retry. When the timer expires in `login` mode, the visible instruction ("Please request a new code") points at the **disabled** Resend button. | `components/OTPVerification.tsx:250,261,45-52` |
| S6 | **Landing-page sparklines are fabricated**: `generateSparkline()` builds the polyline from `sin/cos` noise + the % change, presented as a real trend line in "Markets at a Glance". | `app/page.tsx:107-114,289,362` |

### 10.3 Medium (selected — full list in working notes)

| Finding | Files |
|---|---|
| `router.push()` called **during render** in verify-email/verify-otp pages (React side-effect-in-render warning) | `app/auth/verify-email/page.tsx`, `app/auth/verify-otp/page.tsx` |
| Login page branches on `result.error.includes('verify your email')` substring (fragile) and skips `setIsLoading(false)` on that branch; success redirects to `/` instead of `/dashboard` | `app/auth/login/page.tsx:47-57` |
| `CleanupTrigger` mounted globally fires an unauthorized `POST` on **every page load for every visitor** (should not exist — cron handles cleanup) | `app/layout.tsx:30`, `components/CleanupTrigger.tsx` |
| Hard-coded `className="dark"` on `<html>` → entire light theme in `globals.css` + `themeSlice` are dead code; no toggle anywhere; theme reducers mutate the DOM (impure) and don't persist | `app/layout.tsx:27`, `store/slices/themeSlice.ts` |
| Header "Live" indicator is **hard-coded** — shows Live when no stream is connected; mobile menu overlay is `-z-10` behind page content; no `Escape`/`aria-expanded` | `components/Header.tsx:76-83,128-146` |
| Finnhub WS backoff broken: attempt counter reset **inside** the timer callback → never grows past 1 s, `maxReconnectAttempts` unreachable; token cached forever (24 h expiry); duplicate token fetch per page; no `disconnect()` anywhere; falls back to the client env key on token-fetch failure | `lib/finnhub-websocket.ts:231-240,44-60,290` |
| WebSocket cleanup stashed on `window.__*Cleanup` globals → unmount-before-resolve leaks subscriptions; sockets never disconnected on page exit (landing + analytics) | `app/page.tsx:74-94`, `app/analytics/page.tsx:34-44` |
| Analytics: no loading/empty state for **crypto** movers (empty cards until WS data); ≤5 loaded assets → "Top Gainers" and "Top Losers" show the same set reversed; mover rows are `div onClick` (not keyboard accessible); Gainers/Losers card duplicated ×4 (~70 lines each) | `app/analytics/page.tsx:118-286` |
| Watchlist: fetch failure renders the **"watchlist is empty"** state (no error/retry); failed DELETE optimistically removes the row with no rollback/confirmation; entire table duplicated for CRYPTO vs STOCK (~135 lines) | `app/watchlist/page.tsx:39-242` |
| `trade/history` params unvalidated (`NaN`/huge/negative `limit`, invalid `type` → 500 instead of 400) | `app/api/trade/history/route.ts:30-39` |
| Email HTML injection: raw `name` interpolated into outbound HTML; SMTP `secure:false` without `requireTLS` | `lib/email.ts:119,231,5-13` |
| Portfolio slice: **single shared `loading` flag** across fetch/buy/sell/history → tables flash each other's loaders; `executeBuy/Sell.fulfilled` never refresh `holdings` (literal `// Refresh portfolio` TODO); `error` state never rendered anywhere | `store/slices/portfolioSlice.ts:31,204-229` |
| Dead code / unused deps: `@tanstack/react-query` mounted but never used, `recharts` + `ws` never imported, `components/ui/Table.tsx` (115 lines) unused, `InlineLoading` unused, `motion/SlideUp`+`motion/Card` unused, `themeSlice` actions unused, `StaggerContainer` stagger is a no-op at its only usage | `app/providers.tsx`, `package.json`, `components/*`, `store/slices/themeSlice.ts` |
| No `app/error.tsx` / `global-error.tsx` / `not-found.tsx` anywhere — `UI-UPGRADE-SUMMARY.md` claims "error boundaries with user-friendly messages" (false) | repo-wide |
| News page: `limit=50` with no pagination/load-more; duplicated 6-card skeleton block; no per-article error state | `app/news/page.tsx:33,96-173` |
| Landing `window.__finnhubCleanup` race + Finnhub socket never disconnected; `NEXT_PUBLIC_FINNHUB_API_KEY` read client-side on 4 pages | `app/page.tsx:75-94` + others |

### 10.4 Low / hygiene

- README: **7 dead doc links** (`QUICK_SETUP.md`, `EMAIL_VERIFICATION_SETUP.md`, `VERCEL_HOBBY_FIX.md`, `IMPLEMENTATION_SUMMARY.md`, `BUILD_FIX.md`, `OTP_UNIFICATION.md`, `LICENSE` — deleted in commit `a840d8b`, README never updated); "Screenshots" section has zero images; overstated security claims.
- `.env.example` says "never expose this key client-side" and then defines `NEXT_PUBLIC_FINNHUB_API_KEY`; missing `CLOUDINARY_*` vars.
- `tsconfig.tsbuildinfo` (140 KB build artifact) is **tracked** and shows as modified; `.swc/` not gitignored.
- `tsconfig` `target: es5` (bundle bloat), no `noUnusedLocals`; lint config only `next/core-web-vitals`.
- `globals.css` duplicate keyframes/animation-delay definitions; `:focus { outline: none }` global.
- `next.config.js` uses deprecated `images.domains` (Next 15 → `remotePatterns`).
- Register page: `Full Name` not `required`; min password length 6; email in URL query (PII in history).
- `Footer` copyright wrapped in an anchor whose `href` was commented out (dead link).
- LoadingScreen: fabricated "% complete", dead `isComplete` state, heavy infinite animations as every route's loading UI.
- `prisma` query logging (`log: ['query', ...]`) active in **production** (`lib/prisma.ts`).
- ESLint/eslint-config-next version skew (15.1.0 vs next 15.1.11); `pages/**` in Tailwind content but `lib/**`/`store/**` omitted.

### 10.5 Verified working ✅

- `.env` never committed; no secrets in any tracked file (regex scan over all 110 tracked files); `.gitignore` covers `.env`, `.qwen`, `prompt.txt`, logs.
- `generate-secrets.js` uses `crypto.randomBytes`.
- `package-lock.json` internally consistent (lockfileVersion 3, no peer conflicts, ESLint 9 ↔ eslint-config-next peer-compatible).
- NextAuth configuration: JWT strategy + bcrypt compare + `emailVerified` gate; middleware protects all page routes under `/dashboard|analytics|watchlist|portfolio|profile`.
- News page is the best-behaved for states (loading + error + try-again + empty).
- `components/ui` Button/Input/Card: correct disabled/error/label semantics.
- `prisma migrate status`: DB reachable (Supabase), 1 migration applied, schema up to date.
- Build/lint/typecheck: all pass (§1.5).

---

## 11. Implementation log — what was actually fixed and verified

> Everything below was implemented in the working tree and verified by running
> the app (dev server + endpoint probes), the auth smoke test
> (`scripts/smoke-auth.mjs`, 15/15 PASS), the unit-test suite
> (`npm test`, 35/35 PASS), `npx tsc --noEmit` (clean), `npm run lint` (0 errors,
> 9 pre-existing `no-img-element` warnings), and `npm run build` (32 routes OK).

### Security / data integrity (C1–C4, H1–H3, S3)
- **C1** Finnhub WS token now served server-side (`/api/finnhub/ws-token`, Bearer-authenticated) — `NEXT_PUBLIC_FINNHUB_API_KEY` removed from all client code paths.
- **C2** Cron endpoint requires `Bearer CRON_SECRET`; `CleanupTrigger` component (unauthorized POST per page load) deleted.
- **C3** Trade buy/sell verify prices server-side (`lib/trade-price.ts`, ±3% band), atomic conditional updates, 409/503 mapping.
- **C4** Middleware protects page routes only; API routes return proper 401s (verified: `/api/watchlist`, `/api/profile` → 401 unauthenticated).
- **H1** Chart/price routes use server keys only; crypto charts return real CoinGecko volume (fabricated `Math.random()` volume removed).
- **H2** Auth rate limiting (`lib/rate-limit.ts`, sliding window): register per-IP, verify 5 attempts/15 min then 15-min DB-persisted lockout (`otpAttempts`/`otpLockedUntil`, migration `20261024055951_add_otp_lockout`), resend 60 s spacing + 3/hour per email, login 10/15 min per email.
- **H3** OTPs generated with `crypto.randomInt`, stored as bcrypt hashes, verified with constant-time compare + dummy-hash timing equalization; GET verify-email is stateless (echoes client `exp`, no DB lookup → no countdown oracle); register responses byte-identical (`UNIFORM_REGISTER_RESPONSE`); account-exists email throttled 1/hour.
- **S3** (see H2 — same OTP generation fix).

### Data correctness / page behavior (H4–H8, S1–S6, M3)
- **H4/H5** Shared CoinGecko client (`lib/coingecko.ts`): 20 s TTL cache, request coalescing, 429 → last-known-good flagged `stale`; `lastUpdate` stamped at real fetch time.
- **H6** Chart timeframe labels derive from actual candle spacing ("4h candles · 30 days").
- **H7** Crypto detail page owns its data: `useMarketStream` + REST snapshot on mount + loading/error/retry states (no more infinite loader on deep links).
- **H8** News: cache keyed by `category:limit`; always requests the provider's real `general` feed; Crypto/Stock tabs are an explicitly **keyword-filtered** (word-boundary regex) view, labeled as such in the UI and response `meta` (`filter: "keyword"`).
- **S1** Profile route accepts the current avatar URL as a no-op (name-only saves work again), uploads the new image **before** deleting the old Cloudinary asset, validates name/size server-side, rejects foreign https URLs.
- **S2** Watchlist API GET supports `?symbol&type` membership flag (kills N+1); all lookups case-insensitive; POST stores uppercase + idempotent 200 for duplicates (incl. P2002 race → 200); `WatchlistButton` uses `data.inWatchlist`, checks `response.ok`, optimistic rollback, `aria-pressed`.
- **S4** Watchlist/portfolio pages connect `useMarketStream` + `usePriceSnapshot` (REST fallback for symbols outside the streams' fixed lists); watchlist/portfolio show real error states with retry (not fake "empty" states); portfolio `plPercent` divide-by-zero guarded; failed DELETE rolls back.
- **S5** OTP countdown anchored client-side in the URL (`&exp=`); Resend always enabled; expired state is an inline banner (no dead-end).
- **S6** Fabricated landing-page sparklines removed; `/api/market/overview` serves real sparklines from cached candles.
- **M3** Watchlist create race handled (P2002 → idempotent 200).

### UI/UX + a11y (M6 and Phase B)
- **M6** MarketTable: sortable headers are real buttons with `aria-sort` + `scope="col"`; each row reachable/activatable via a focusable symbol button (Tab/Enter).
- **Header** Live indicator now reflects real stream status (Binance gained a status API: `getStatus`/`onStatus`; Finnhub's `subscribeStatus` wired in) — states: Live / Live · 10s (polling) / Connecting / Offline / Standby; mobile overlay z-order fixed; `Escape` closes the menu; `aria-expanded`/`aria-controls` added.
- **Theme** dark/light toggle actually works: pure reducers (`themeSlice`), `ThemeSync` applies + persists via localStorage, `ThemeToggle` in the header (desktop + mobile); the previously dead light theme in `globals.css` is now reachable.
- **Error pages** `app/error.tsx` (route boundary with digest + reset), `app/global-error.tsx` (last-resort, inline styles, no app deps), `app/not-found.tsx` (branded 404) — verified: unknown URL → custom 404.
- **stock-chart** `OANDA:XAU_USD` alias check moved before the symbol allowlist regex (gold chart was permanently unreachable).

### Market-analysis features (Phase C)
- **`lib/indicators.ts`** — SMA, EMA (SMA-seeded), Wilder RSI, MACD(12/26/9), Bollinger(20,2σ, population σ), cumulative VWAP, `last`/`pctChange` helpers. Methodology documented in the module header; every function null-safe; **35 unit tests** (`lib/indicators.test.ts`, `lib/rate-limit.test.ts`) pin formulas to reference values. (Writing the tests caught and fixed a real SMA sliding-window bug.)
- **`/api/fear-greed`** — real Crypto Fear & Greed index from alternative.me (free, keyless, verified live: value 51/Neutral, 30-day series); 10-min cache, stale degradation, `meta.computedBy: "provider"` attribution.
- **`FearGreedCard`** (Analytics page) — gauge on the provider's 5-band scale + 30d low/avg/high + explicit source label ("provider-computed, not calculated by FinScope").
- **`TechnicalInsights`** (crypto detail page) — RSI-14/SMA-20/MACD/Bollinger computed **client-side from real CoinGecko candles** via the tested library, with per-line interpretation and a provenance footer separating provider data from FinScope calculations; labeled "not a trading signal".

### Testing infrastructure (Phase D/E start)
- **vitest** configured (`vitest.config.ts`, node env, `@/` alias); `npm test` / `npm run test:watch` scripts.
- **`scripts/smoke-auth.mjs`** — 15-check live-server regression for the auth hardening (uniform bodies, stateless countdown, ghost emails, hashed OTP, lockout, resend cooldown, replay handling). Uses `.test` TLD mailboxes + fixture cleanup; runs against `localhost:3000`.

### Password reset + email templates (follow-up request)
- **Forgot-password flow** — `POST /api/auth/forgot-password` (enumeration-safe: byte-identical 200 for known/unknown emails, same bcrypt work before the branch; 60 s resend cooldown, 3/hour per email, 10/hour per IP; only verified credential accounts actually receive a code) and `POST /api/auth/reset-password` (bcrypt-hashed code compared with constant-time verify + dummy-hash timing equalization, 5 failed attempts → 15-min DB-persisted lockout (`resetAttempts`/`resetLockedUntil`), uniform generic `Invalid or expired code`, new password hashed at cost 12, all reset state cleared atomically, "password changed" security email sent). Migration `20261024090000_add_password_reset` adds `passwordResetToken` (unique), `passwordResetExpires`, `resetAttempts`, `resetLockedUntil`.
- **UI** — `/auth/forgot-password` (email → uniform "check your inbox" state → continue), `/auth/reset-password` (code + new password + confirm, resend button surfacing `retryAfterSec`, success → `/auth/login?reset=success` banner), "Forgot password?" link on the login page.
- **Email templates rebuilt** — one shared `renderEmail()` shell (preheader, branded header with gradient accent, 600px card, footer), table-based inline styles for Outlook/Gmail compatibility, plain-text alternative on every send, all user-derived values HTML-escaped (fixes the audit's "email HTML injection" note), five templates: verification OTP, password reset, password changed (CTA + security callout), welcome, account exists. SMTP config now prefers `SMTP_*` env names with legacy `EMAIL_*` fallback and forces STARTTLS on non-465 ports.
- **`scripts/smoke-reset.mjs`** — 14-check live regression for the flow: uniform forgot responses, ≥60 s cooldown, ghost==real wrong-code behavior, 5-attempt lockout (correct code rejected while locked), happy-path reset (old hash no longer matches, new one does, state cleared), single-use replay → generic 400. **14/14 PASS**; `smoke-auth.mjs` re-run after the `lib/email.ts` rewrite — 15/15 PASS.
- **Documented residual**: sessions are 30-day JWTs, so a reset cannot retroactively revoke tokens issued on other devices (would need a server-side session registry); the "password changed" email tells the owner to act if the change wasn't theirs.

### Known accepted residuals
- In-memory rate limiter & caches are per-process (documented): on serverless, limits are per-instance — swap the store for Redis for global guarantees.
- Register's existing-branch may skip SMTP on the 3rd+ attempt within an hour (weak timing signal, capped by the email throttle) — noted in code.
- Watchlist/portfolio REST snapshots cover at most 15 stock symbols per load (free-tier Finnhub budget); more would need batching.
- M1 (float money in Prisma schema) intentionally not migrated — breaking data migration, documented for a dedicated pass.
