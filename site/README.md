# site: Last Drop

SvelteKit + TypeScript, static output (`adapter-static`, everything prerendered). The site is a set of projections; it reads data only through `SiteApi` (`src/lib/data/api.ts`), the read side of the contract API in `contracts/`.

```
contracts Snapshot ─► publicView ─► contract projections ─► SiteApi ─► routes
                                   (home, project, activity, chapter, graph)
```

Adapters behind `SiteApi`:

- `snapshotApi(snapshot)`: in-process, the contract projections over a Snapshot. Used with the shared generator (`sim/`).
- `httpApi(base, { static })`: the contract HTTP API, live (`/api/v1/home`) or a static export (`/home.json`).

Pages never import storage, never compute status or "current", never write. Ids map to routes in one place: `src/lib/links.ts`.

## Run

```sh
npm ci
npm run dev        # renders sim media into static/sim, then vite dev
npm run build      # same, then prerender; fails on any broken internal link or #anchor
npm test           # one source feeds every projection; http and in-process give identical views
npm run check
```

Config is in `.env.example`. Default is `PUBLIC_CONTENT_SOURCE=sim` with `PUBLIC_SIM_SEED=42`.

Routes: `/ru|en/` home, `projects/`, `projects/<key>/`, `activity/`, `evolution/` (graph feed until the map engine exists), `manga/`, `manga/<key>/<page>/`, `about/`.
