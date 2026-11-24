# landing

## End goal

The home base for Brandon's network, served at `home.example`. Open it from any device, find the bookmark you want, and leave in seconds. Bookmarks live centrally on the site, so no device needs its own copy, and nobody has to remember ports or IPs. It also gives a throwaway sandbox app a place to be linked before it has a domain.

Eventually it grows into an at-a-glance dashboard (live per-service info, system health, weather) with admin-only editing, anonymous read-only viewing, and private tiles hidden from public visitors.

**Users:** Brandon, plus household and friends. LAN-only at first; local DNS resolves `home.example` on the home network.

**Design:** a warm, earthy, phone-first design (390px prototype, "homelab & good vibes"). Desktop is the same design stretched into a responsive tile grid.

## Phases

Current phase: **Phase 0 (MVP)**, not started.

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

- **One URL per bookmark.** Local DNS resolves `home.example` on the home network, so there's no need for separate LAN and external URLs.
- **No-login editing is MVP-only.** It's acceptable because the MVP is LAN-only; auth (Phase 1) must ship before any public exposure.
- **`private` flag is stored from the start** (not enforced until Phase 1) to avoid a later data migration.
- **The idle lock screen is cosmetic.** Anyone can tap through it. It is not, and must not be treated as, access control.
- **Server context:** `home.example` has no nginx vhost today, so this will be the first thing served at the bare domain. See `docs/home.example/README.md`.
- **Reference design:** `mockups/` holds the original phone-sized prototype (open `mockups/index.html`) and a board of the screens it lacks (`mockups/screens.html`: desktop grid, add/edit, arrange, empty/loading/error). Both are references for the port, not code to carry forward.

### What the prototype has that Phase 0 keeps, changes, or defers

- **Keep:** earthy look, favorites row, groups, search, status dot, external-links group, settings tab, idle lock screen.
- **Change:** tiles must actually link to their URL (they don't in the prototype); detail line becomes URL + last checked; status needs a defined `warning`; phone layout becomes a responsive grid on desktop.
- **Defer:** system-health and weather widgets, live per-tile detail lines (Phase 2); down-app notifications (Phase 3).
- **Missing from the prototype:** add/edit/delete form, reordering and moving between groups, `temporary` tag, `private` flag, per-tile last-checked time, empty/loading/error states, desktop layout, favicons (it uses colored initials).
- **Prototype bugs (don't port):** the `dangerouslySetInnerHTML` prop isn't handled by its `h()` helper, so the containers line never renders; the "Earthy mode" toggle does nothing.

## Open questions

- What `warning` means for a reachability check (slow? non-2xx?).
- "Earthy mode" toggle in the design: real theme switch, or remove?
- Do Settings persist across devices, or stay per device?
- ~~Designs still needed: add/edit form, empty state, loading and error states, desktop grid.~~ Drafted in `mockups/screens.html` (SPOKE-26), pending Brandon's review.

## Tech

Mostly not chosen yet. Defaults come from `docs/policy.md` at implementation time.

**Decided (Brandon, 2026-11-23): bookmarks live in Postgres**, following the policy's per-product setup:

- Database `landing_db` on the existing local Postgres (dev PC), owned by the migration role.
- `landing_migrator`: owns the schema and runs migrations only (DDL).
- `landing_app`: the role the running site uses. Data access only (`SELECT`/`INSERT`/`UPDATE`/`DELETE` on its tables), with no DDL and no ownership. It isn't read-only, because the UI adds, edits, and deletes bookmarks.
- Parameterized queries only. Credentials come from env/compose at deploy time and are never committed; only a `.env.example` with placeholders goes in the repo.
- The repo gets the standard `.githooks/` version-bump hooks when Phase 0 is scaffolded.
