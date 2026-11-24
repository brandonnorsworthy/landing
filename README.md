# landing

## End goal

The home base for a home network, served at the network's own domain. Open it from any device, find the bookmark you want, and leave in seconds. Bookmarks live centrally on the site, so no device needs its own copy, and nobody has to remember ports or IPs. It also gives a throwaway sandbox app a place to be linked before it has a domain.

Eventually it grows into an at-a-glance dashboard (live per-service info, system health, weather) with admin-only editing, anonymous read-only viewing, and private tiles hidden from public visitors.

**Users:** the household and friends. LAN-only at first; local DNS resolves the site's domain on the home network.

**Design:** a warm, earthy, phone-first design (390px prototype, "homelab & good vibes"). Desktop is the same design stretched into a responsive tile grid.

## Phases

Current phase: **Phase 0 (MVP)**, built and tested on the dev PC; production rollout in progress (SPOKE-245).

- [ ] **Phase 0 / MVP**
  - Tiles that link to their URL (one URL per bookmark), with name, group, and icon or favicon
  - Add, edit, delete, and move between groups in the page, with no login
  - Groups, search/filter, favorites row, separate external-links group
  - Status dot (up / warning / down) with a last-checked time; tile detail line shows the URL and last checked
  - Optional `temporary` tag; `private` flag stored but not enforced
  - Settings tab (density, auto-refresh)
  - Cosmetic idle screen: returns after about 2 minutes idle, one tap dismisses it. Not security.
  - Responsive: phone layout, tile grid on desktop
  - LAN only
- [ ] **Phase 1: Auth.** Admin login, anonymous read-only viewing, private tiles hidden from the public. Must be done before any public exposure.
- [ ] **Phase 2: Live data.** Per-tile detail from each service, one integration at a time (Uptime Kuma, UniFi Protect, Plex, Docker, etc.). System-health and weather widgets.
- [ ] **Phase 3: Notifications.** Down-app notifications (needs push).

## Decisions and design notes

- **One URL per bookmark.** Local DNS resolves the site's names on the home network, so there's no need for separate LAN and external URLs.
- **No-login editing is MVP-only.** It's acceptable because the MVP is LAN-only; auth (Phase 1) must ship before any public exposure.
- **`private` flag is stored from the start** (not enforced until Phase 1) to avoid a later data migration.
- **The idle lock screen is cosmetic.** Anyone can tap through it. It is not, and must not be treated as, access control.
- **Server context:** the site is the first thing served at the bare domain; host nginx proxies it to the container (details in the server docs, not in this repo).
- **Reference design:** `mockups/` holds the original phone-sized prototype (open `mockups/index.html`) and a board of the screens it lacks (`mockups/screens.html`: desktop grid, add/edit, arrange, empty/loading/error). Both are references for the port, not code to carry forward.

### What the prototype has that Phase 0 keeps, changes, or defers

- **Keep:** earthy look, favorites row, groups, search, status dot, external-links group, settings tab, idle lock screen.
- **Change:** tiles must actually link to their URL (they don't in the prototype); detail line becomes URL + last checked; status needs a defined `warning`; phone layout becomes a responsive grid on desktop.
- **Defer:** system-health and weather widgets, live per-tile detail lines (Phase 2); down-app notifications (Phase 3).
- **Missing from the prototype:** add/edit/delete form, reordering and moving between groups, `temporary` tag, `private` flag, per-tile last-checked time, empty/loading/error states, desktop layout, favicons (it uses colored initials).
- **Prototype bugs (don't port):** the `dangerouslySetInnerHTML` prop isn't handled by its `h()` helper, so the containers line never renders; the "Earthy mode" toggle does nothing.

## Settled questions (2026-11-23)

- **Warning** (SPOKE-24): reachable but slow (over 2 s), or a 5xx. Any answer below 500 within 2 s is up (401/403 mean the app is alive behind its own login); no answer within 5 s is down. External links are not checked.
- **Earthy mode** (SPOKE-25): removed; it did nothing in the prototype.
- **Settings** (SPOKE-25): per device, in the browser's localStorage.
- **Designs** (SPOKE-26): `mockups/screens.html`, approved.

## Tech

- **API:** .NET 10 minimal API, EF Core with Npgsql (`src/Landing.Api`). Serves the page from `wwwroot` and the JSON API under `/api`.
- **Page:** React + TypeScript (strict) + Vite (`src/Landing.Web`), fonts bundled so nothing loads from other sites (CSP `'self'`).
- **Tests:** xUnit integration tests against a real Postgres (`tests/Landing.Tests`); ESLint, Prettier and `tsc` for the page.
- **Image:** `ghcr.io/brandonnorsworthy/landing`, port 8080, published by `release.yml`. Deployed by `stacks/landing`.

### Database

Bookmarks live in Postgres, per the workspace database policy (2026-11-23):

| Thing | Name | Purpose |
|---|---|---|
| Database | `landing_db` | Owned by the migration role |
| Migration role | `landing_migrator` | Owns the schema; used only by the `migrate` step (DDL) |
| App role | `landing_app` | Used by the running site; `SELECT`/`INSERT`/`UPDATE`/`DELETE` only, owns nothing. Not read-only, because the page writes bookmarks |

`db/bootstrap.sql` creates all three (run once as a superuser, passwords passed as psql variables, never stored). The image runs `migrate` as a one-shot step with the migrator's connection string; the site only ever gets the app role's. A test checks the app role is refused `CREATE`/`DROP`/`ALTER`/`TRUNCATE`.

### One image, three commands

| Command | What |
|---|---|
| *(none)* | The site on port 8080. Needs `ConnectionStrings__App`. |
| `migrate` | Applies EF Core migrations, then exits. Needs `ConnectionStrings__Migrator`. |
| `healthcheck` | Exits 0 if `/health` answers (the runtime image has no curl). |

## Development

Needs .NET 10 SDK, Node 24, and the local Postgres (`stacks/postgres` container on the dev PC).

```bash
git config core.hooksPath .githooks          # once per clone: version bumps from commit messages
cp .env.example .env                         # fill in two generated passwords
# create landing_db and the roles (superuser password from stacks/postgres/.env):
docker exec -i postgres psql -U postgres -v migrator_password=... -v app_password=... < db/bootstrap.sql
while IFS= read -r l; do [ -n "$l" ] && export "$l"; done < .env
dotnet run --project src/Landing.Api -- migrate
dotnet run --project src/Landing.Api          # API + built page on http://localhost:8080
cd src/Landing.Web && npm ci && npm run dev   # page with hot reload on :5173, /api proxied to :8080
```

Tests: export `LANDING_TEST_ADMIN` (a superuser connection string; each test class makes and drops its own database) and `LANDING_TEST_APP` (the `landing_app` connection from `.env`), then `dotnet test`. Page checks: `npm run lint`, `npm run format:check`, `npm run typecheck`.

Versioning: the hooks bump `<Version>` in `Directory.Build.props` from the commit message (`feat:` minor, other code changes patch, docs-only none). Release: tag `vX.Y.Z` on a green `main` with the version the commit carries.
