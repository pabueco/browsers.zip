# browsers.zip

This is a tool to easily download any version of chromium or firefox directly from the source.

## Setup

Use a Node.js version supported by Nuxt 4: 22.19+, 24.11+, or 26+. This project
pins its pnpm version through Corepack. If your Node.js installation does not
include Corepack, install it separately before enabling it.

```bash
corepack enable
pnpm install --frozen-lockfile
```

Run the focused tests with `pnpm test` and the Nuxt and Vue type checks with
`pnpm typecheck`.

## Development Server

Start the development server on `http://localhost:3000`

```bash
pnpm dev
```

## Production

Build the application for production:

```bash
pnpm build
```

Vercel should use this build command. The Chromium endpoints require the Nuxt
server runtime and are not available from a fully static `pnpm generate` deploy.

Locally preview production build:

```bash
pnpm preview
```

## Chromium history

The browser loads Chromium versions through server API routes. On Vercel, the
version lists are cached with ISR for six hours and resolved snapshot links are
cached for 30 days. Historical milestones 5 through 58 use immutable branch
positions bundled from `server/assets/chromium-history.json`; newer positions
come directly from Chromium Dash.

The history manifest is checked in so builds do not depend on external APIs. It
only needs to be regenerated if its derivation changes:

```bash
pnpm generate:chromium-history
```

Chromium snapshots are best-effort builds near a Chrome milestone's branch
point. They are not the exact Chrome release displayed alongside the milestone.

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
