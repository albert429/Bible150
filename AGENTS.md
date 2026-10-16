# Repository Guidelines

## Project Structure & Module Organization

Bible150 is a static React/TypeScript Arabic Bible reader built with Vite.
`src/reader/` renders Scripture; `src/plan/` manages schedules, profiles, and
backups; `src/navigation/` contains the toolbar and sheets. Audio, study,
and optional AI use `src/audio/`, `src/study/`, and `src/ai/`.
Shared helpers belong in `src/lib/` and `src/bible/`; reusable UI belongs in
`src/components/`. Keep component CSS adjacent to components and shared tokens
in `src/styles/`.

`data/` holds source data; `scripts/` imports and builds static JSON into
`public/`. Runtime assets live in `src/assets/`; documentation images belong in
`docs/assets/`. See `docs/development.md` for the full architecture.

## Build, Test, and Development Commands

Use Node.js 22 and `npm ci` for locked dependencies.

- `npm run dev`: generate data and start Vite on port 5173.
- `npm run build`: generate data, type-check, and build `dist/`.
- `npm start`: preview the production build on port 4173.
- `npm run validate`: check formatting, lint, types, unit tests, and build.
- `npm run test:e2e`: build audio fixtures and run Playwright workflows.
- `python3 -I -m unittest discover -s scripts/tests`: test Python utilities.

Install browser binaries with `npx playwright install chromium webkit`.
Use `PW_PORT=4400 npm run test:e2e` in concurrent worktrees; the next two ports
serve AI tests. Avoid reusing stale preview servers.

## Coding Style & Naming Conventions

Use strict TypeScript, ES modules, two-space indentation, double quotes, and
semicolons. Prettier enforces 80-column formatting and trailing commas;
`npm run format` applies it. ESLint checks TypeScript and React hooks.
Name components `PascalCase.tsx`, hooks `useSomething.ts`, and helper modules
`camelCase.ts`.

## Testing Guidelines

Node's test runner executes `tests/*.test.ts` through `npm test`.
Playwright specs live in `tests/browser/*.spec.ts`, covering Chromium, mobile
WebKit, and axe accessibility checks. Add regression coverage for changed
behavior and preserve exact Scripture-data checks. For UI changes, verify
320–430px widths, both themes, large Arabic text, focus, and reduced motion.

## Commit & Pull Request Guidelines

Use concise imperative subjects, following history: “Split the audio player
into focused hooks and controls.” Keep commits focused. Follow
`.github/pull_request_template.md`: explain the user-facing change and validation;
include mobile screenshots for visual changes and link relevant issues.

## Data & Configuration Safeguards

Preserve Scripture wording, passage order, attribution, and progress/backup
compatibility. Regenerate data through documented importers; do not hand-edit
`public/readings/`, `public/study/`, or `public/audio/`.
Never commit credentials, private backups, audio binaries, or generated reports.
Treat `VITE_*` values as public. Keep working artifacts in ignored `artifacts/`
and concurrent worktrees in `.agents/`; leave other contributors' checkouts intact.
