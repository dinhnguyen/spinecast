# Spinecast: development and deployment

[Tiếng Việt](DEVELOPMENT.vi.md) · [← README](../README.md)

---

## Running locally

```bash
git submodule update --init --recursive
npm install
npm run db:migrate:local
npm run dev
```

The submodule step is required: `npm run dev` fails without the vendored `vendor/foliate-js` checkout (see [Vendored foliate-js](#vendored-foliate-js)).

Sync settings are encrypted at rest, so saving them locally needs a gitignored `.dev.vars` holding a `SYNC_ENC_KEY`:

```
SYNC_ENC_KEY=...
```

Generate one with `openssl rand -base64 32`, the same way the production secret is created under [Cloudflare setup](#cloudflare-setup).

Because `.dev.vars` is gitignored, **a fresh git worktree will not have it**, and the OPDS e2e spec then dies inside `atob()` on an invalid key. Copy it across from the main checkout.

Seed an admin to log in with locally:

```bash
npm run admin:hash -- 'your-password'
# copy the printed hash into scripts/seed-admin.sql (copy from scripts/seed-admin.sql.example first)
npx wrangler d1 execute spinecast --local --file scripts/seed-admin.sql
```

The admin mints invite codes under Cài đặt › Mã mời; everyone else registers with one.

## Tests

```bash
npm test                          # worker (miniflare: real D1, R2, KV) and web (jsdom)
npx playwright install chromium   # once, before the first test:e2e run
npm run test:e2e                  # Playwright, two projects: desktop and mobile
npm run typecheck                 # lint:strings plus tsc for both worker and web
```

`scripts/e2e-seed.sh` leaves an admin you can log in as after an e2e run:

| Email | Password |
|---|---|
| `admin@dev.local` | `123456` |

Local only. `123456` is shorter than the eight-character minimum `/api/auth/register` enforces, so **nobody can register this password**; it works because the script writes the hash straight into D1 and `/api/auth/login` does not check length. Users the e2e specs register at runtime still use passwords over eight characters.

Things to know before trusting a test result:

- **`npm run test:e2e` starts its own dev server via `scripts/e2e-seed.sh`, and that script wipes local Wrangler state**, including the KV-backed login rate limiter. But Playwright's `reuseExistingServer` reuses a dev server you already had running and **skips the seed step entirely**, so repeated e2e runs against it eventually trip the login rate limit. Stop the stray server first.
- **The `worker` project shares one D1 database across a whole test file**; `isolatedStorage` is off. Any test that seeds a primary key must randomise it the way `createUser` does. A hardcoded id plus `on conflict do nothing` silently resolves to an earlier test's row.
- **The `web` project has no global React Testing Library cleanup** and does not install `@testing-library/jest-dom`. A test that mounts more than once must call `cleanup()` itself, and matchers like `toBeDisabled` do not exist - use DOM properties.
- **For any layout or CSS-order question, build and measure; reading the className is not evidence.** jsdom implements no layout: `scrollWidth` is always 0, and class order tells you nothing about which rule wins. Two bugs have survived several review rounds because everyone reasoned about the className instead.

## Cloudflare setup

```bash
npx wrangler d1 create spinecast
npx wrangler kv namespace create SESSIONS
npx wrangler r2 bucket create spinecast-books
```

Paste the resulting D1 database id and KV namespace id into `wrangler.jsonc`. Then set the secret used to encrypt crosspoint-sync credentials at rest:

```bash
npx wrangler secret put SYNC_ENC_KEY
# paste a value from: openssl rand -base64 32
```

## Deploying

**Run migrations before deploying the worker**, not after. Every migration so far is additive, so running them early is safe; deploying new code first means that code queries columns which do not exist yet.

```bash
npm run db:migrate:remote
npx wrangler d1 execute spinecast --remote --file scripts/seed-admin.sql   # first time only
npm run deploy
```

### Migrations

| File | What it adds |
|---|---|
| `0001_init.sql` | 11 tables: users, invites, books, sync_settings, reading_progress, bookmarks, clippings, sync_cursors, reading_sessions, book_stats, global_stats |
| `0002_user_locale.sql` | `users.locale` for i18n |
| `0003_opds.sql` | `books.shared` and the `opds_tokens` table for the served catalogs |
| `0004_devices.sql` | the `devices` table, plus `reading_progress.device_id` and `observed_at` |
| `0005_bookmarks.sql` | `bookmarks.chapter` and an index for delta sync |
| `0006_clippings.sql` | `clippings.cfi` and an index for delta sync |
| `0007_reading_stats.sql` | `users.timezone`, `reading_sessions.device_id`, `dirty` flags on `book_stats` and `global_stats` |
| `0008_opds_catalogs.sql` | the `opds_catalogs` table and provenance columns on `books`, for the OPDS client |
| `0009_passkeys.sql` | the `passkeys` table |

`0001` already creates `bookmarks`, `clippings` and the three stats tables, so later phases only add columns rather than recreating tables. Read `0001_init.sql` before writing a new migration.

None of these has been applied remotely: nothing has ever been deployed for real from these development sessions.

### Before the first real deploy

- **A passkey is bound to the hostname it was created on.** The RP ID comes from the request, so a passkey enrolled against `localhost` will not work on the production hostname and vice versa. That is WebAuthn behaving as specified, not a bug, but it means the passkey path cannot be smoke-tested locally and then trusted in production. Enrol a fresh passkey on a real device after deploying and check it. The whole ceremony is currently verified only by a software authenticator and Chromium's virtual authenticator.
- **Run `docs/opds-koreader-check.md`** - a seven-item checklist against a real KOReader that has never been run. The item that matters most is downloading a book whose filename carries Vietnamese diacritics.
- **A rollback after deploying logs out everyone who logged in since**, because the old worker hands the whole JSON session value to `findUserById`. Sessions predating the deploy survive; no data is lost.
- **An already-loaded browser tab running pre-deploy JS sends no `observedAt`**, so once any other device stamps a real one, that tab's writes are dropped silently while its badge still reads "synced". A reload clears it.

## UI strings and i18n

`src/web/i18n/vi.ts` is the source of truth; `src/web/i18n/en.ts` must carry exactly the same keys, which TypeScript enforces. Add a string to both.

`npm run lint:strings` (part of `npm run typecheck`) fails if Vietnamese text leaks outside those two tables. It only scans `.ts`/`.tsx` under `src/worker`, `src/web` and `src/shared`, so markdown and documentation prose are unaffected.

## UI artboards

The UI is binding: the implementation must match the artboards in `docs/design/mockups/`. They are generated from code, so do not hand-edit them:

```bash
node docs/design/mockups/gen.mjs
```

The palette lives in the `T` constant in `gen.mjs` and must be **identical** to the `@theme` block in `src/web/styles.css`. `src/web/palette.test.ts` computes WCAG contrast for every pair and also asserts the two files agree, so a new token has to be added in both places.

Two tokens look alike and do different jobs; do not merge them back together:

- `border` #e4dccf is decorative: dividers and card outlines, which WCAG sets no minimum for.
- `control` #968a78 outlines an input or an icon-only button, things whose box is the only identifier, which WCAG 1.4.11 requires to clear 3:1.

## Vendored foliate-js

The EPUB rendering engine (foliate-js) is a git submodule at `vendor/foliate-js`, pinned to commit `78914ae`:

```bash
git submodule update --init --recursive
git -C vendor/foliate-js log -1   # check the pinned commit after pulling
```
