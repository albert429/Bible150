![An open Bible and a phone reader](docs/assets/readme-banner.png)

# The Holy Bible / الكتاب المقدس

قراءة واستماع، بالترتيب المعتاد أو الزمني.

An Arabic Bible reader with Scripture given almost the entire screen. Originally built for the youth of the **Brethren Church at Kholousy**, the app is expanding from its 150-day New Testament plan and whole-Bible reader into four reading choices.

The expanded release is **under integration**. The current app features below describe the existing reader; the [product guide](docs/product.md) describes the approved four-mode experience and its compatibility requirements.

[Open the app](https://sfk-bible-reading.vercel.app/) · [Development guide](docs/development.md) · [Data sources](data/SOURCES.md)

[![Checks](https://github.com/albert429/Bible150/actions/workflows/checks.yml/badge.svg)](https://github.com/albert429/Bible150/actions/workflows/checks.yml)

## Current reader

- One slim, sticky toolbar; the rest of the page is for reading.
- Clear Arabic text in Amiri, adjustable from 22–38px, with light and dark themes.
- Original passage order, Scripture section headings, verse numbers, and quick passage jumps.
- Two reading modes in the menu: «خطة القراءة» (the 150-day plan) and «الكتاب المقدس» (all 66 books, Genesis to Revelation, with source section headings, Psalm titles and paragraphs). Each mode remembers its place; chapters have shareable links and work with Back/Forward.
- A personal start date, a 150-day calendar, completion with undo, and multiple readers on one device.
- Local progress, JSON backup/restore, and optional sharing initiated by the reader.
- Static frontend hosting, daily reading caches, nearby readings prepared in the background, and secondary screens loaded on demand.
- Optional recorded reading with a small audio player; recordings load only when requested. Daily readings and New Testament chapters highlight each verse; Old Testament chapters play without verse tracking for now. Bible mode can continue to the next chapter.

<p align="center">
  <img src="docs/assets/mobile-reader.png" width="300" alt="Actual mobile app: a slim Arabic day toolbar followed immediately by Scripture" />
</p>

## Made for daily reading together

![An illustration of church youth reading a Bible and a phone together](docs/assets/community-reading.png)

Developed by **Albert Alfred** for the youth of the Brethren Church at Kholousy.

Contact: [albertalfred429@gmail.com](mailto:albertalfred429@gmail.com) · GitHub: [albert429](https://github.com/albert429)

The banner and community illustration are generated artwork. The mobile screenshot shows the actual app. [Artwork prompts and provenance](docs/design/image-prompts.md) are included in the repository.

## Run locally

Use **Node.js 22** and npm. No credentials or environment variables are required. The optional AI explanations need an OpenRouter key; see the [development guide](docs/development.md#ai-explanations-optional).

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Development and production builds automatically generate the static reading files from `data/plan.json`.

```sh
npm run validate                    # Formatting, unit/data tests, production build
npx playwright install chromium webkit
npm run test:e2e                    # Build, then mobile Chromium + WebKit, including accessibility
npm start                           # Preview the production build on port 4173
```

## Hosting and privacy

React, TypeScript, and Vite build a static `dist/` directory. Vercel settings are checked into `vercel.json`; use the Vite preset and `npm run build`. The app requires no backend, database, or public API.

Progress and appearance preferences stay in the current browser. There is no automatic account sync or live group tracking. Backups contain the reader's name, start date, and completed days; keep them private. Readings need a network connection on their first fetch; the app does not currently provide persistent offline access.

The optional AI explanations («اسأل الذكاء الاصطناعي») are off unless a deployment enables them. When a reader uses them, after a one-time notice, the verse, its context and any question they type go to OpenRouter and the model's provider, which may keep the text and train on it. The reader's name and progress are never sent. The key is public by design, so it is limited to free models and a $0 credit limit; see the [development guide](docs/development.md#ai-explanations-optional).

See the [development guide](docs/development.md) for architecture, deployment troubleshooting, source regeneration, and performance checks. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes.

The existing audio pipeline supports separately hosted static audio: the New Testament is a dramatised Van Dyck recording and the Old Testament a non-dramatic one, both distributed by Faith Comes By Hearing (credits in the app's About and in [audio provenance](data/audio/SOURCES.md)). See the [audio guide](docs/audio.md) for local preparation, timing review, CDN setup, and free-tier bandwidth estimates. A normal Git-only deployment keeps audio hidden until media is available or an audio host is configured. Audio recording rights are separate from the public-domain Scripture text; consult the provenance and applicable recording terms.

## Scripture attribution and rights

The bundled Scripture is the **Arabic Van Dyck / فان دايك, eBible.org `arb-vd` edition**. eBible.org identifies this edition as **public domain**. Translation is credited to the Syrian Mission, with the American Bible Society listed as a contributor. This project claims **no copyright over the Scripture text**. This statement applies to the identified source edition; it does not make a claim about every modern Bible edition or its editorial material. [Source and rights statement](https://ebible.org/bible/details.php?id=arb-vd).

Amiri and Noto Sans Arabic are distributed under the SIL Open Font License 1.1. Application code has no open-source license grant. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the separate terms covering code, Scripture, fonts, and artwork.

---

<p>
  <sub><img src="docs/assets/react-mark.svg" width="14" height="14" alt="" /> Built using <a href="https://react.dev/">React</a><br />
  Scripture data courtesy of <a href="https://ebible.org/bible/details.php?id=arb-vd">eBible.org</a> — Arabic Van Dyck, public domain.</sub>
</p>
