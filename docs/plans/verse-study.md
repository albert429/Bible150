# Verse Study Panel + Browser-only AI ("✦ اسأل الذكاء الاصطناعي")

> **Status.** Phase 1 (the verse study panel) is implemented, with deviations: the cross-references section was removed in 17dc106, sections start collapsed with Greek last, and the KJV was added. Phase 2 (the browser-only AI explainer) is implemented via the merged `feature/ai-explainer` branch. The text below is the original brief, kept for history.

> **Self-contained execution brief.** It assumes no access to the planning conversation. Every decision below is final and was agreed with the repo owner (Albert Alfred, GitHub `albert429`). Facts marked _(verified)_ were checked on 2026-10-07.

---

## 0. Context

`albert429/Bible-NTin150Days` is a smartphone-first Arabic (RTL) New Testament reader following a 150-day chronological plan, built for a church youth group whose members are all 18 or older.

- **Stack:** Vite 6, React 19 and strict TypeScript, deployed as a static site on Vercel. There is no backend, no accounts and no database.
- **Runtime dependencies:** only `react`, `react-dom` and `lucide-react`, styled with plain CSS.
- **Scripture text:** Arabic Van Dyck (eBible `arb-vd`, public domain).

**Goal.** A reader taps any verse and gets a quiet bottom sheet with real study data:

- Greek words, each mapped to the Van Dyck Arabic word it translates
- cross-references (including OT) that expand inline
- another Arabic translation
- (Phase 2) a browser-only AI that explains the verse using only that retrieved data

**Constraints.**

- The reading page must stay exactly as minimal and fast as today: Lighthouse mobile performance about 88, LCP about 3.6 s, CLS 0.086, and the first verse at about 162 px at 390×844.
- No pre-generated AI commentary.
- No server code.
- The kalimatelhaq and injeel commentaries are copyrighted, and injeel claims rights on its digital Van Dyck text, so neither is used.

## 1. Agreed decisions (final)

| Topic            | Decision                                                                                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger          | Tapping anywhere on a verse highlights it subtly and opens the existing bottom `Sheet`. A text selection, long-press (>500 ms) or drag (>10 px) does NOT open it. Nothing new is visible on the page. The verse number becomes a real `<button>` for keyboard and screen-reader users. |
| Panel layout     | Stacked sections in one scroll, using native `<details>`: (1) header with the reference and verse text; (2) ✦ AI row (Phase 2); (3) **الكلمات اليونانية**, open; (4) **شواهد (N)**, open, inline expand, no navigation; (5) **ترجمات أخرى**, closed.                                   |
| Greek row        | `الْكَلِمَةُ ← λόγος`, with a muted second line: transliteration · Strong's · English gloss.                                                                                                                                                                                           |
| Cross-references | Tapping one expands its verse text inline; no navigation. OT references are included, using Van Dyck OT text for preview only.                                                                                                                                                         |
| Static data      | Real, openly licensed data only. See §3.                                                                                                                                                                                                                                               |
| CC BY-SA         | Acceptable. Data derived from BY-SA sources ships as separate data files under CC BY-SA. App code stays "All rights reserved" (`LICENSE`).                                                                                                                                             |
| AI provider      | **OpenRouter is primary**: browser `fetch`, OpenAI-compatible SSE, a shipped key with a $0 credit limit (free models only).                                                                                                                                                            |
| AI design        | A provider-agnostic interface plus a fallback chain, so Gemini can be added later by config.                                                                                                                                                                                           |
| Firebase         | **Not used.** Its App Check enforcement becomes mandatory on 2026-11-02 _(verified)_ and needs reCAPTCHA, which the owner rejected.                                                                                                                                                    |
| AI limits        | 10 answers per device per day (cache hits are free), with answers cached on-device. The AI row is hidden when no env config is set.                                                                                                                                                    |
| AI icon          | A custom four-point concave "spark" (Gemini-like silhouette) filled with `currentColor` (the app's olive token), not the rainbow logo. The answer footer names the model that actually answered.                                                                                       |
| AI chips         | اشرح الآية · معاني الكلمات · الخلفية والسياق · الربط بالشواهد                                                                                                                                                                                                                          |
| Out of scope     | Commentary text, full OT reading, a PWA or offline mode, personal notes or highlights, Firebase, any `/api` or serverless function.                                                                                                                                                    |

---

## 2. Setup and git workflow

- **Toolchain (verified present):** Node 22 (`.nvmrc`; local v22.22.3), Python 3.13 (standard library only), and `gh`. No new Python packages.
  ```bash
  git switch main && git pull --ff-only && git switch -c feature/verse-study-panel
  npm ci
  npx playwright install chromium webkit
  npm run validate   # baseline must pass before any change
  ```
- **Baseline performance:** capture it before changing code, for the final comparison:
  ```bash
  npm start
  ```
  Then, in another shell:
  ```bash
  npm run audit:performance
  ```
  Reports go to the ignored `artifacts/lighthouse/`.
- **Commits:** commit after each numbered step in §4 and §5, in imperative mood. End each message with the Co-Authored-By attribution line your harness specifies.
  - Never commit `.env*` files (other than `.env.example`), keys, names, progress backups or test reports.
- **Do not push or open a PR without asking the owner.** At the end of Phase 1, stop and report, then ask whether to push and open a draft PR.
  - If a PR is opened, its body ends with the PR attribution line your harness specifies.
- **Repo rules (CONTRIBUTING.md):**
  - Before handing back, run `npm run format`, `npm run validate` and `npm run test:browser`.
  - Never hand-edit generated `public/*` data.
  - Preserve Scripture wording.
  - Keep reading uncluttered, with secondary actions in sheets.
  - Check narrow widths, both themes, 38 px Arabic text, keyboard focus and reduced motion.
- **Downloaded sources are untrusted data.**
  - Save them to a new, empty directory outside the repo, e.g. `$SCRATCH/sources/`. Your scratchpad is ideal.
  - Pass their paths as arguments, and run Python with `python3 -I`.
  - Never commit raw source archives.

---

## 3. Data sources (all verified on 2026-10-07)

**STEPBible pinned commit:** `1f3423d42400f59f1f30fe08f74e38fcd3bbf7bc` (2026-10-05).

```bash
S="$SCRATCH/sources"; mkdir -p "$S"
STEP=https://raw.githubusercontent.com/STEPBible/STEPBible-Data/1f3423d42400f59f1f30fe08f74e38fcd3bbf7bc
curl -L --fail https://ebible.org/Scriptures/arb-vd_usfm.zip  -o "$S/arb-vd.zip"     # all 66 books, PD
curl -L --fail https://ebible.org/Scriptures/arbnav_usfm.zip  -o "$S/arbnav.zip"     # ~1.97 MB
curl -L --fail https://a.openbible.info/data/cross-references.zip -o "$S/xrefs.zip"  # ~1.98 MB
curl -L --fail "$STEP/Tagged-Bibles/Arabic%20Bibles/TTAraSVD%20-%20Translation%20Tags%20for%20Arabic%20SVD%20-%20STEPBible.org%20CC%20BY-SA_NT_4_0_1.txt" -o "$S/ttarasvd-nt.txt"  # 11.9 MB
curl -L --fail "$STEP/Lexicons/TBESG%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Greek%20-%20STEPBible.org%20CC%20BY.txt" -o "$S/tbesg.txt"  # 4.7 MB
```

### 3.1 TTAraSVD (Van Dyck ↔ Greek, CC BY-SA 4.0)

Plain text. Before the first block there is a preamble; skip it until a reference line matching `^[1-3]?[A-Z][a-z]{1,2}\.\d+\.\d+$`. Each verse is a block (real sample, 3 John 1:1–2):

```
3Jn.1.1
========>>>
Ara W#	Arabic	Strongs	Greek	Lexicon	Gloss	Transliteration	Grammar	Grk w#
		G3588	Ὁ			Ho	T-NSM	#01NKO
#01	اَلشَّيْخُ،	G4245G	πρεσβύτερος	πρεσβύτερος	elder	presbuteros	N-NSM	#02NKO
#02 - #03	إِلَى غَايُسَ	G1050J	Γαΐῳ	Γάϊος	Gaius	Gaiō	N-DSM-P	#03NKO
...
#08	بِالْحَقِّ.	G0225	ἀληθείᾳ.	ἀλήθεια	truth	alētheia	N-DSF	#10NKO
<<<========
3Jn.1.2 ...
#07 - #09	أَنْ تَكُونَ نَاجِحًا	G4771; G2137	σε ; εὐοδοῦσθαι	σύ; εὐοδόω	you; to get along well	se; euodousthai	P-2AS; V-PPN	#05NKO; #06NKO
```

- **Row order** is Arabic order. `Ara W#` is either one position (`#01`) or a span (`#02 - #03`).
  - Blank `Ara W#` means a Greek-only word (e.g. the article Ὁ).
  - Blank Greek or Strongs means an Arabic-only word: skip it.
- **Multi-Greek rows:**
  - Split the Strongs, Lexicon, Gloss, Translit, Grammar and Grk w# columns on `;`.
  - Split the Greek column on the regex `\s+;\s+`, because a Greek question mark `;` can be attached to a word.
  - All split counts must match. On a mismatch, log it and drop that row.
- **Edition suffix** follows the `#NN` in Grk w#: N = NA27/28, K = the KJV translators' Textus Receptus (Scrivener 1894), O = other editions. Brackets mark a variant; lowercase marks a minor difference.
  - **TR rule:** keep a Greek token if its suffix, lowercased with `[]()` removed, contains `k`.
- **Prefixes:** a `[c:v]`-style prefix may appear where the Greek versification differs. Strip it and keep the token under the SVD (block) verse.
- **Book codes:** look like `Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas 1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev`. Confirm them by collecting the distinct codes, and fail on any code not in `data/books.json`.
- **Vocalisation:** the Arabic is vocalised but can differ slightly from the eBible text. See the alignment section.

### 3.2 TBESG lexicon (CC BY 4.0)

- Tab-separated. Header (line ~88): `eStrong  dStrong  uStrong  Greek  Transliteration  Morph  Gloss  <definition (Abbott-Smith, HTML)>`.
- Sample rows:
  ```
  G0027   G0027 =                G0027   ἀγαπητός  agapētos  G:A    beloved       <b>ἀγαπητός</b>, -ή, -όν <BR /> …
  G4245   G4245H = a Meaning of  G4245G  πρεσβύτερος …                elder: old    …
  ```
- **Key:** take the first token of `dStrong` (`G0027`, `G1050J`, `G4245H`), which matches TTAraSVD's Strongs.
  - Fallback 1: `uStrong`.
  - Fallback 2: the 5-character base (`G4245`) against `eStrong`.
- **Definition:** strip the HTML to plain text, convert `<ref='Mat.3.17'>…</ref>` to its inner text, collapse whitespace, and truncate to 400 characters at a word boundary.

### 3.3 OpenBible cross-references (CC BY 4.0; credit "openbible.info")

- The zip contains `cross_references.txt`, tab-separated, 344,799 rows.
- Header: `From Verse	To Verse	Votes	#www.openbible.info CC-BY 2026-10-05`.
- Rows look like `Gen.1.1	Isa.40.28	67`. Targets can be ranges, e.g. `John.1.1-John.1.3` or `Ps.89.11-Ps.89.12`.
- 1,242 rows have negative votes.
- **The 66 OSIS-style codes:** `Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev`.
- Its numbering follows English versification, so resolve every target against Van Dyck and drop the ones that don't resolve.

### 3.4 eBible zips

- `arb-vd.zip`: `scripts/import.py` already reads it. Files match `-{USFM}arb-vd.usfm`, all 66 books.
- `arbnav.zip`: New Arabic Version / كتاب الحياة. Inspect it with `unzip -l` and expect `-{USFM}arbnav.usfm`.
  - Licence: CC BY-SA 4.0, "Copyright © 1988, 1997, 2012 Biblica, Inc.®".
  - Required source sentence: "The original work by Biblica, Inc. is available for free at www.biblica.com and open.bible."
  - Trademark: "Biblica®" is a registered trademark. Derivative works must remove the mark.
  - So: show the text verbatim, stripped of markup only, and label it «الترجمة العربية الجديدة (كتاب الحياة)». Never use "Biblica" as a UI label; it appears only in notices.

---

## 4. Phase 1: Static study data + panel

### Step 1. `data/books.json` + `scripts/usfm.py`

- **`data/books.json`:** 66 rows in canonical order, each `[usfm, osis, step, arabicName]`, e.g. `["JHN","John","Jhn","يوحنا"]`.
  - NT Arabic names must equal `BOOKS` in `scripts/import.py:10-38`. Load it with `importlib.util.spec_from_file_location`; `main()` is guarded.
  - OT Arabic names come from each arb-vd book's `\h` (or `\toc2`) marker.
  - Add `data/books.json` to `.prettierignore`.
- **`scripts/usfm.py`:** a stream parser for one book's USFM, returning `{chapter: {verse: text}}` plus a bridge map.
  - Tokenise the whole book on `\c N` and `\v N` or `\v N-M` markers, not line by line, so paragraphs (`\p`, `\q1`, …) with several verses per line work.
  - Strip `\f … \f*`, `\x … \x*` and every other marker using the same rules as `import.py:60-63`. Ignore `\s1` headings.
  - Collapse whitespace.
  - **Bridges:** for `\v 25-26`, assign the text to both verses and record bridge `"25-26"`.
- **Acceptance:** `scripts/import-study.py` (step 2) asserts that usfm.py's arb-vd NT text equals every verse text in `data/plan.json` byte for byte. On a mismatch, fix the parser; never change plan.json. `import.py` stays unchanged.

### Step 2. `scripts/import-study.py`

Run it as:

```bash
python3 -I scripts/import-study.py --vd "$S/arb-vd.zip" --nav "$S/arbnav.zip" --xrefs "$S/xrefs.zip" --tbesg "$S/tbesg.txt" --ttarasvd "$S/ttarasvd-nt.txt"
```

1. **Van Dyck:** parse all 66 books with `usfm.py`. Every OT and NT chapter must have contiguous verses. Run the plan.json byte-identity check.
2. **Greek and alignment** (per NT verse in Van Dyck):
   - **VD tokens** = `text.split(" ")`, asserting there are no empty tokens. Indices are 0-based.
   - **SVD tokens:** rebuild them from the `Ara W#` positions (`#02 - #03` with «إِلَى غَايُسَ» gives positions 2 and 3).
   - **`norm(w)`:**
     1. Remove `[ؐ-ًؚ-ٰٟۖ-ۭـ]`.
     2. Map `ٱأإآ→ا`, `ة→ه`, `ى→ي`, `ؤ→و`, `ئ→ي`.
     3. Keep only `[ء-ي]`.
   - **Mapping:**
     - If the normalised lists are equal, map positions one to one.
     - Otherwise run `difflib.SequenceMatcher(None, a, b, autojunk=False)`: map `equal` blocks one to one, and map `replace` blocks of equal length position by position. Everything else stays unmapped.
   - **Verse acceptance:** at least 85% of the SVD positions used by Greek-linked rows map, and every row's span maps to a contiguous VD range.
     - If accepted, each token gets `a0`/`a1`, an inclusive VD token range.
     - If rejected, all of that verse's `a0`/`a1` are `null`, but its Greek is kept.
   - **Tokens:** keep TR tokens only (§3.1), with Arabic-only rows skipped. Each token is `[greek, translit, strong, morph, gloss, a0, a1]`, in TTAraSVD row order. Tokens from one multi-Greek row share the same `a0`/`a1`.
3. **Lexicon:** build `{strong: {l: lemma, g: gloss, d: definition}}` for every Strong's number used by kept tokens, following §3.2.
4. **Cross-references:**
   - Keep rows whose source is NT and `votes > 0`. Drop self-references and targets overlapping the source.
   - Convert to ref IDs: `BOOK.C.V`, `BOOK.C.V-V2` (same chapter) or `BOOK.C.V-C2.V2`, using USFM codes.
   - Resolve every verse of the range against Van Dyck; drop unresolved targets and count them.
   - Keep the top 10 per source verse by votes, descending; on a tie, keep file order.
   - Repeated verses share one ID, so they get one entry.
5. **OT preview text:** for every kept OT target, store the text of its first 3 verses only.
6. **NAV:** parse with `usfm.py`. Store a plain string per verse, or `{"b":"25-26","t":"…"}` on each verse of a bridge.
7. **Gates** (non-zero exit with a clear message):

   | Check                                   | Threshold |
   | --------------------------------------- | --------- |
   | NT verses with ≥1 TR Greek token        | ≥ 99.5%   |
   | Verses with accepted alignment          | ≥ 97%     |
   | Tokens whose Strong's misses TBESG      | ≤ 0.5%    |
   | Cross-ref targets dropped as unresolved | ≤ 1%      |
   | Van Dyck NT verses covered by NAV       | ≥ 98%     |
   | Unknown book codes in any source        | 0         |

8. **Coverage line:** print it (verses, tokens, aligned %, xrefs kept and dropped, OT verses, NAV coverage) and paste it into `data/SOURCES.md`.

**Outputs (minified JSON, `ensure_ascii=False`, `separators=(",",":")`, keys sorted for stable diffs):**

| File                      | Shape                                                                         | Licence                 |
| ------------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| `data/study/greek.json`   | `{"JHN.1.1":[["Ἐν","En","G1722","PREP","in",0,0],…]}`                         | CC BY-SA 4.0 (TTAraSVD) |
| `data/study/lexicon.json` | `{"G3056":{"l":"λόγος","g":"word","d":"a word …"}}`                           | CC BY 4.0 (TBESG)       |
| `data/study/xrefs.json`   | `{"JHN.1.1":["GEN.1.1","PRO.8.22-30","1JN.1.1-2"]}`                           | CC BY 4.0 (OpenBible)   |
| `data/study/ot-vd.json`   | `{"GEN.1.1":"فِي الْبَدْءِ …"}`                                               | Public domain           |
| `data/study/nav.json`     | `{"JHN.1.1":"…","ROM.3.25":{"b":"25-26","t":"…"}}`                            | CC BY-SA 4.0 (Biblica)  |
| `data/study/LICENSE.md`   | Per-file licence, attribution, changes made, source URLs and STEPBible commit | —                       |

- Add `data/study/` to `.prettierignore`.
- Expected repo growth is about 14–18 MB, which is fine for GitHub since every file is under 100 MB. If `greek.json` exceeds 15 MB, move `gloss` into `lexicon.json`.
- Update `data/SOURCES.md` with the URLs, fetch date, STEPBible commit, the OpenBible header date (2026-10-05) and the coverage line.

### Step 3. `scripts/build-study.js` (per-day static files)

- **Wiring:** an ES module (repo is `"type":"module"`). Import it at the end of `scripts/build-readings.js` (`import "./build-study.js";`) so `predev` and `prebuild` don't change.
  - It reads `data/plan.json`, `data/books.json` and `data/study/*`, and writes the gitignored `public/study/`.
  - Add `public/study/` to `.gitignore` and `.prettierignore`.
  - Add a `vercel.json` header for `/study/(.*)` with `public, max-age=0, must-revalidate`, matching `/readings/`.
- **Core file `public/study/{d}.json` (`StudyDay`):**
  ```json
  {
    "v": 1,
    "day": 12,
    "p": ["MRK", "LUK"],
    "verses": {
      "MRK.1.1": {
        "g": [["Ἀρχὴ", "Archē", "G0746", "N-NSF", "beginning", 0, 0]],
        "x": ["MAL.3.1", "ISA.40.3-5"],
        "n": "بَدْءُ إِنْجِيلِ يَسُوعَ …"
      }
    }
  }
  ```
  - `p[i]` is the USFM code of `passages[i].book`.
  - `x` keeps at most **8** refs per verse. Tune this down if the budget fails, and record the final number in the docs.
- **Refs file `public/study/{d}.refs.json` (`StudyRefs`):**
  ```json
  {
    "v": 1,
    "day": 12,
    "refs": {
      "ISA.40.3-5": {
        "t": [
          [40, 3, "…"],
          [40, 4, "…"],
          [40, 5, "…"]
        ]
      },
      "PRO.8.22-30": {
        "t": [
          [8, 22, "…"],
          [8, 23, "…"],
          [8, 24, "…"]
        ],
        "more": 6
      }
    }
  }
  ```
  - Keyed by ref ID and deduped across the day.
  - `t` items are `[chapter, verse, text]`, at most 3 per ref, plus `more` for the rest.
  - NT text comes from `data/plan.json`; OT text comes from `ot-vd.json`.
- **Lexicon file `public/study/{d}.lex.json`:** `{"v":1,"day":12,"lex":{"G0746":{"l","g","d"}}}`, holding only the Strong's numbers used that day. It is emitted now but used in Phase 2.
- **Validation** (throw, which fails `prebuild`):
  - Every plan verse has an entry.
  - `p` matches the books.
  - Every `x` ID has a refs entry with at least one text.
  - Every `a0 ≤ a1 < tokenCount`.
  - The 7 repeated verses yield identical entries.
  - **gzip budgets** (via `node:zlib` `gzipSync`): core ≤ 30 KB, refs ≤ 35 KB, lex ≤ 35 KB per day.
  - Log "Generated 150 study days" plus the maximum sizes.
- **Test `tests/static-study.test.js`:** follow `tests/static-readings.test.js`, which imports the build script and then reads its outputs. Assert:
  - 150 days of each file type
  - for every plan verse, the core entry's `g` equals `greek.json` (with `x` sliced to 8) and `n` equals `nav.json`
  - refs resolve
  - repeated verses are equal
  - budgets hold

### Step 4. `src/jsonClient.ts` (refactor, no behaviour change)

- Extract the generic logic from `src/readings.ts:13-73` (cache Map, pending Map dedupe, AbortController timeout, failures never cached, Arabic error message) into:
  ```ts
  export function createJsonClient<T>(
    opts: {
      url: (key: string) => string;
      validate: (data: unknown, key: string) => data is T;
      message: (key: string) => string;
    },
    fetcher: typeof fetch = fetch,
    timeoutMs = 15000,
  ): { load(key: string): Promise<T>; peek(key: string): T | undefined };
  ```
- `createReadingsClient` keeps its exact API (`load`, `peek`, `prefetchDay`) and messages on top of it. The existing `tests/readings.test.js` must pass unchanged.
- Add `tests/json-client.test.js` covering dedupe, timeout, no poisoned cache and validation failure.

### Step 5. Reader trigger (main bundle; must add under 1 KB gzipped)

- **`src/components/Reader.tsx`, inside `Scripture`:**
  - The verse span becomes `<span className="verse" data-v={verse.number}>`.
  - Replace `<sup aria-label=…>{ar(n)}</sup>` with:
    ```tsx
    <sup>
      <button
        type="button"
        className="verse-number"
        aria-haspopup="dialog"
        aria-label={`تفاصيل الآية ${ar(verse.number)}`}
      >
        {ar(verse.number)}
      </button>
    </sup>
    ```
  - `Scripture` stays memoised on `reading` only, and no props are added to it.
- **In `Reader`:** add `const [target, setTarget] = useState<Target | null>(null)`, where `Target = { passage: number; verse: number; el: HTMLElement }`, and add delegated handlers on `<article className="reader">`:
  - **`onPointerDown`:** record `{t: performance.now(), x, y, hadSelection: !(getSelection()?.isCollapsed ?? true)}`.
    - On the first pointerdown only, if `allowsReadingPrefetch(navigator.connection)` passes, call `void import("../study/StudyPanel")`. The function is exported from `src/useAdjacentPrefetch.ts:6`. This warms the chunk only; no JSON is fetched.
  - **`onClick`:**
    - `const verseEl = (e.target as Element).closest(".verse")`; return if it's missing.
    - **Keyboard** (`e.detail === 0`): accept only if the target is a `.verse-number` button.
    - **Pointer:** ignore it if `hadSelection`, if the selection is still non-collapsed, if the tap lasted over 500 ms, or if it moved over 10 px.
    - Get the passage index from `verseEl.closest("section.passage")!.id` (`passage-N`) and the verse from `data-v`.
    - Set `verseEl.dataset.selected = ""` and `setTarget(...)`.
  - **On close** (`onAfterClose`): `delete target.el.dataset.selected` and `setTarget(null)`.
  - **When `reading?.day` changes:** `setTarget(null)`.
- **`src/components/VerseStudy.tsx`** (main bundle, ~40 lines):
  - Rendered by `Reader` once `target` has ever been set; keep it mounted afterwards so `Sheet` animates.
  - Uses the existing `Sheet` (`src/components/Sheet.tsx:10-17`: `open, title, onClose, onAfterClose, returnFocusTo, children`).
  - `title` is `${book} ⁦${ar(ch)}:${ar(v)}⁩`, where the LRI/PDI isolate keeps `chapter:verse` order, like `PassageReference`'s `<bdi dir="ltr">`.
  - `returnFocusTo` is `target.el.querySelector(".verse-number")`.
  - The body shows the verse text (Amiri, `var(--verse-size)` capped at 24 px), then:
    ```tsx
    <ChunkBoundary><Suspense fallback={<Loading label="جارٍ تحميل دراسة الآية…" />}><StudyPanel …/></Suspense></ChunkBoundary>
    ```
    with `const StudyPanel = lazy(() => import("../study/StudyPanel"))`. This is the same pattern as About in `src/components/Navigation.tsx:12,199-203`, with `ChunkBoundary` and `Loading` from `src/components/Feedback.tsx`.
- **CSS (`src/styles.css`, existing tokens only):**
  - `.verse[data-selected]{background:var(--soft);border-radius:4px;-webkit-box-decoration-break:clone;box-decoration-break:clone}`
  - `.verse-number`: reset to look exactly like the current `.verse sup` (`styles.css:372-377`: Noto 12 px, olive, `line-height:0`): `padding:0;border:0;background:none;font:inherit;color:inherit;line-height:inherit;cursor:pointer`, plus a visible `:focus-visible` outline using `--olive`.
  - Move `padding-inline-end:7px` so the spacing is unchanged.
  - Respect the existing reduced-motion block (`styles.css:1241-1248`).
  - The first-verse offset must stay ≤ 200 px; there is an existing Playwright check for this.

### Step 6. Lazy study chunk `src/study/`

- **`types.ts`:**
  ```ts
  export type GreekToken = [
    w: string,
    translit: string,
    strong: string,
    morph: string,
    gloss: string,
    a0: number | null,
    a1: number | null,
  ];
  export type NavText = string | { b: string; t: string };
  export type StudyVerse = { g: GreekToken[]; x: string[]; n?: NavText };
  export type StudyDay = {
    v: 1;
    day: number;
    p: string[];
    verses: Record<string, StudyVerse>;
  };
  export type StudyRefs = {
    v: 1;
    day: number;
    refs: Record<string, { t: [number, number, string][]; more?: number }>;
  };
  export type LexDay = {
    v: 1;
    day: number;
    lex: Record<string, { l: string; g: string; d: string }>;
  };
  ```
- **`books.ts`:** imports `../../data/books.json` (66 rows of our own data; `resolveJsonModule` is on) and exports `usfmFor(arabicName)` and `arabicFor(usfm)`. Only lazy chunks may import it.
  - Never import `data/study/*` into `src`, so the JS bundle stays free of BY-SA data.
- **`verse.ts`:**
  - `verseId(usfm, ch, v)`
  - `parseRef(id)`
  - `refLabel(id)`: Arabic book name plus `ar()` digits from `src/format.ts`, wrapped in LRI/PDI, e.g. «إشعياء ٤٠:٣–٥».
  - `tokens(text)`: `split(" ")`
  - `span(text, a0, a1)`: tokens joined with trailing `،.:؛!؟,` stripped
  - `groupRows(g)`: groups consecutive tokens that share `a0`/`a1`
- **`client.ts`:** three `createJsonClient` instances for `/study/${d}.json`, `/study/${d}.refs.json` and `/study/${d}.lex.json`.
  - Validators check `v === 1 && day === key` plus the shape.
  - Arabic messages, e.g. «تعذر تحميل دراسة الآية. تحقق من الاتصال وحاول مرة أخرى.».
- **`useResource.ts`:** the same late-response-safe pattern as `src/useReading.ts`.
- **`StudyPanel.tsx`** (default export). Props: `{ day: number; passageIndex: number; reading: Day; verse: Verse }`.
  - Load core and refs **in parallel**. Greek renders as soon as core arrives.
  - On error, show `LoadError` with a retry.
  - Sections, built with `Section.tsx` as `<details open?><summary><h3>…</h3></summary>…</details>`:
    1. _(Phase 2 slot: `AiRow`)_
    2. **`GreekWords.tsx`** «الكلمات اليونانية», open.
       - One row per group: `<span class="greek-ar">{span}</span><span aria-hidden="true">←</span><bdi lang="grc" dir="ltr">{greek words}</bdi>`.
       - Second muted line, in `<bdi dir="ltr">`: `translit · G-number (strip a trailing letter) · gloss`.
       - Unaligned groups show «—» for the Arabic.
       - Hide Greek-only groups whose morph starts with `T-` (articles) to reduce clutter.
       - Greek font: `"Noto Serif","Times New Roman",serif` (no new font bytes).
    3. **`CrossRefs.tsx`** «شواهد (N)», open. Each `CrossRefItem.tsx` is a `<button aria-expanded aria-controls>` showing `refLabel`.
       - When expanded, it shows the texts with small verse numbers, plus «و{ar(more)} آيات أخرى» when `more` is set.
       - If refs are still loading, show a mini loader; on failure, a retry.
       - It never navigates.
    4. **`OtherTranslation.tsx`** «ترجمات أخرى», closed. Shows the label «الترجمة العربية الجديدة (كتاب الحياة)», plus «(الآيات {b})» for bridges.
  - **Footer:** a tiny muted sources line, «المصادر: STEPBible · OpenBible.info · كتاب الحياة (CC BY-SA)», linking to About.
- **CSS:** `.study-*`, `.greek-row`, `.greek-ar`, `.greek-meta`, `.xref`, `.xref-text`, using tokens only. Dark mode works automatically through `html[data-theme="dark"]`.
  - Must work at 320 px with 38 px text, with no horizontal overflow.

### Step 7. Docs and attribution (Phase 1)

- **`THIRD_PARTY_NOTICES.md`:** add a section "Study data" covering:
  - OpenBible.info cross-references (CC BY 4.0)
  - STEPBible TTAraSVD (CC BY-SA 4.0; Tyndale House / STEPBible.org; the Arabic text digitisation is credited as in the file header)
  - TBESG (CC BY 4.0)
  - NAV: the copyright line, licence, source sentence and trademark note from §3.4
  - Van Dyck OT (public domain)

  State that `data/study/` and `public/study/` are licensed under these data licences, separately from the "All rights reserved" code, and that the changes made were extraction, normalisation and per-day splitting.

- **`public/licenses/study-data.txt`:** the same notice, shipped with the site.
- **`src/components/About.tsx`:** add a short credits paragraph with links, next to the existing `about-rights` block (line ~31). About is lazy, so this costs nothing at startup.
- **`docs/development.md`:**
  - Source-structure rows for `src/study/`, `scripts/import-study.py`, `scripts/build-study.js` and `data/study/`.
  - A "Study data regeneration" subsection with the §3 commands and the expected coverage line.
  - New Lighthouse before/after numbers in the "Verification baseline" format.
- **`CONTRIBUTING.md`:** never hand-edit `public/study/`. Change study data only through `import-study.py`.

**Phase 1 is done when:**

- `npm run validate` and `npm run test:browser` pass.
- The new browser tests (§6) pass.
- Lighthouse performance is ≥ 87 with no LCP or CLS regression.
- The initial JS grows by under 1 KB gzipped. Compare `dist/assets/index-*.js` gzip sizes before and after.

Then stop, report the numbers, and ask the owner about push and PR.

---

## 5. Phase 2: AI (OpenRouter-first, provider-agnostic)

### Step 8. `src/ai/` (all lazy; no new npm dependencies)

- **`config.ts`:** reads `import.meta.env`; no SDK imports.
  - `VITE_AI_PROVIDERS`: comma list, e.g. `openrouter`. Empty means AI is off.
  - `VITE_OPENROUTER_API_KEY`
  - `VITE_OPENROUTER_MODELS`: comma list of free models; `openrouter/free` is always appended last.
  - `VITE_AI_DAILY_CAP`: default **10**.
  - Export `aiEnabled()`.
  - Type these in `src/vite-env.d.ts` (`interface ImportMetaEnv`) and add `.env.example` with placeholders and comments.
- **`types.ts`:**
  ```ts
  export type ChipId = "explain" | "words" | "background" | "links";
  export type AiErrorKind =
    | "quota"
    | "server"
    | "network"
    | "timeout"
    | "auth"
    | "empty"
    | "invalid"
    | "aborted";
  export class AiError extends Error {
    constructor(
      readonly kind: AiErrorKind,
      readonly status?: number,
    ) {
      super(kind);
    }
  }
  export type AiRequest = {
    system: string;
    prompt: string;
    maxOutputTokens: number;
  };
  export type AiMeta = { provider: string; model: string };
  export interface AiProvider {
    readonly id: string;
    stream(
      req: AiRequest,
      signal: AbortSignal,
      onText: (delta: string) => void,
    ): Promise<AiMeta>;
  }
  ```
- **`providers/openrouter.ts`:**
  - Request: `POST https://openrouter.ai/api/v1/chat/completions`.
    - Headers: `Authorization: Bearer ${key}` and `Content-Type: application/json`, plus OpenRouter's optional app-attribution headers (check the current names at openrouter.ai/docs). Use **ASCII values only**: an Arabic header value makes `fetch` throw.
    - Body: `{models, stream: true, max_tokens: req.maxOutputTokens, messages: [{role:"system",content:req.system},{role:"user",content:req.prompt}]}`.
  - Status mapping: 429 → quota, 402 → quota (key credit limit), 401/403 → auth, 5xx → server, 400 → invalid.
  - A `TypeError` from fetch → network.
- **`sse.ts`:** parse the event stream.
  - Ignore lines starting with `:` (keep-alives) and stop at `data: [DONE]`.
  - Text comes from `choices[0].delta.content`, and the footer model from `chunk.model`.
  - A chunk with an `error` object becomes an `AiError("server")`. Errors can arrive after an HTTP 200.
- **`chain.ts`:**
  - Tries providers in config order. Timeouts: 15 s to the first token, then 20 s idle.
  - **Before the first token:** quota, server, network, timeout, auth and empty errors move on to the next provider. An auth error also disables that provider for the session.
  - **After the first token:** any error stops the chain. The partial text is kept and a retry is offered. Text from two models is never spliced together.
  - `invalid` and `aborted` are rethrown immediately.
- **`prompt.ts`:** `PROMPT_VERSION = 1`, `maxOutputTokens = 700`.
  - **System prompt (Arabic):**
    ```
    أنت مساعد لدراسة الكتاب المقدس لشباب كنيسة إنجيلية. اكتب بالعربية الفصحى المبسطة.
    - اعتمد فقط على المادة المرفقة وعلى المعلومات التاريخية العامة الثابتة.
    - لا تذكر شواهد غير موجودة في المادة المرفقة، واكتب المرجع كما ورد.
    - لا تخترع معاني يونانية؛ استخدم التعريفات المرفقة.
    - إذا لم تكن متأكدًا فقل ذلك صراحة.
    - في المسائل العقائدية الخلافية اعرض الآراء باختصار دون حكم.
    - لا تتجاوز ٢٠٠ كلمة، بفقرات قصيرة أو نقاط.
    ```
  - **User message:** labelled blocks for:
    - `المرجع`
    - `نص الآية (فاندايك)`
    - `السياق` (±3 neighbouring verses from the same passage in the in-memory `Day`)
    - `الكلمات اليونانية` (per group: Arabic span ← Greek · translit · Strong's · morph · gloss, plus the TBESG definition from `{d}.lex.json` for the «معاني الكلمات» chip)
    - `الشواهد` (each refLabel plus its texts from the refs file)
    - `الترجمة العربية الجديدة`
    - `المطلوب`
  - **Chip tasks:**
    - explain: «اشرح معنى الآية في سياقها بإيجاز.»
    - words: «اشرح معاني الكلمات اليونانية الرئيسية بالعربية، مع الكلمة المقابلة في ترجمة فاندايك.»
    - background: «اذكر الخلفية التاريخية والثقافية وموقع الآية في سياق الأصحاح.»
    - links: «بيّن كيف تلقي الشواهد المرفقة الضوء على هذه الآية.»
  - The prompt is built only from these arguments. It must never read `nt-reading-progress-v1`, names or any localStorage.
- **`cache.ts`** (localStorage, every access wrapped in try/catch):
  - `nt-study-ai-v1`: an LRU of 60 entries `{key, text, meta}`, keyed `${verseId}|${chip}|${PROMPT_VERSION}`.
  - `nt-study-ai-usage-v1`: `{date: today(), n}`, using `today()` from `src/format.ts` (Cairo).
  - `remaining()` uses the cap, and cache hits don't count.
  - These keys are not part of progress backups; `src/progress.ts` is unchanged.
- **`format.tsx`:**
  - Blank lines become `<p>`. Lines starting `- `, `• `, `1.` or `١.` become lists. `**x**` becomes `<strong>`.
  - **React text nodes only. Never use `dangerouslySetInnerHTML`.**
- **`run.ts`:** `ask(chip, context, signal, onText)` ties the cache, cap, chain and prompt together. It's the module dynamically imported on the first chip tap.

### Step 9. UI: `src/study/AiRow.tsx`, `src/study/AiAnswer.tsx`, `src/components/AiSpark.tsx`

- **`AiSpark.tsx`:**
  ```tsx
  <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 1.5Q13.2 10.8 22.5 12Q13.2 13.2 12 22.5Q10.8 13.2 1.5 12Q10.8 10.8 12 1.5Z"
    />
  </svg>
  ```
  Colour comes from `color: var(--olive)`.
- **`AiRow`:** rendered only if `aiEnabled()`.
  - Header: AiSpark plus «اسأل الذكاء الاصطناعي».
  - Four chip buttons (`.ai-chip`, pill style from tokens) with `aria-pressed` on the active one.
  - The first tap runs `import("../ai/run")`.
  - Muted line: «يُرسَل نص الآية فقط، دون اسمك أو تقدّمك.»
- **`AiAnswer`:**
  - Streams with updates batched per `requestAnimationFrame`. Sets `aria-busy` while streaming and has a polite `role="status"` live region announcing «جارٍ الإعداد…» and «اكتملت الإجابة».
  - Footer: «إجابة مولَّدة بالذكاء الاصطناعي، قد تحتوي أخطاء · {meta.model}».
  - **Messages:**
    - cap reached: «وصلت للحد اليومي ({ar(cap)} إجابات). حاول غدًا.»
    - all providers failed: «الخدمة مشغولة الآن. حاول لاحقًا.», with a retry
- Closing the sheet aborts any in-flight request via `AbortController`.

### Step 10. Phase 2 docs

- **`docs/development.md` "AI (optional)" section:**
  - Env vars.
  - Setup by the owner, who will provide the key and must never paste it into chat or commits:
    1. On their OpenRouter account, create a **dedicated key with a $0 credit limit**, then verify that free models still work with it. If they don't, set the smallest limit possible.
    2. **Recommended:** a one-time $10 credit purchase. The free-model limit is account-wide, 50 requests a day, rising to 1,000 a day after $10 is bought once, which suits 50–200 readers. The key limit stays $0.
    3. Test 2–3 current free models on 5 sample verses for Arabic quality, then set `VITE_OPENROUTER_MODELS`.
    4. Set the env vars in Vercel and redeploy.
  - **Privacy paragraph:** requests carry only Scripture context. OpenRouter and the model provider see the reader's IP address. The key is public by design, and its worst case is quota exhaustion, not cost.
- **`THIRD_PARTY_NOTICES.md`:** note OpenRouter as an optional service. No new software dependency.
- **`CONTRIBUTING.md`:** AI env keys are public by design and capped. Never commit `.env*` files.

---

## 6. Tests

**Unit tests** (`tests/*.test.js`, `node --experimental-strip-types --test`; import `.ts` directly and use fake `fetcher`/`Response.json` like `tests/readings.test.js`):

| File                     | Covers                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `json-client.test.js`    | dedupe, timeout abort, no poisoned cache, validation                                                                                                                        |
| `static-study.test.js`   | §4 step 3 assertions and budgets                                                                                                                                            |
| `study-helpers.test.js`  | `verseId`, `parseRef` (single, same-chapter and cross-chapter ranges), `refLabel` Arabic digits and isolates, `span` punctuation stripping, `groupRows`                     |
| `ai-chain.test.js` (P2)  | fake providers for 429, 402, 503, `TypeError`, first-token timeout, 400 (no fallback), auth disabling the provider, error after the first token (no fallback, partial kept) |
| `ai-sse.test.js` (P2)    | split chunks across reads, `:` comments, `[DONE]`, `error` chunk after 200, model capture                                                                                   |
| `ai-format.test.js` (P2) | `<img src=x onerror=alert(1)>` renders as plain text; lists and bold                                                                                                        |
| `ai-cache.test.js` (P2)  | LRU eviction, `PROMPT_VERSION` in the key, Cairo-date rollover resets usage, cap                                                                                            |
| `ai-prompt.test.js` (P2) | all context blocks present; reads no localStorage (stub throws)                                                                                                             |

**Browser tests** in the new `tests/browser/study.spec.ts`:

- **Setup:** move `seed`, `ready`, `closeSheet` and `noOverflow` from `tests/browser/reader.spec.ts:13-58` into `tests/browser/helpers.ts`, and import them in both specs. Use `test.use({ reducedMotion: "reduce" })`. Stub `**/study/*.json` with `page.route` where useful.
- **Phase 1 checks:**
  - Initial load requests no `/study/` URL and no study chunk.
  - Tapping a verse:
    - opens a dialog whose name is the reference
    - gives the verse `data-selected`
    - requests exactly `{d}.json` and `{d}.refs.json`
    - on close, removes `data-selected` and focuses that verse's `.verse-number`
  - A selection made via `Range` and then a click does not open it.
  - Keyboard: Tab to «تفاصيل الآية ١», press Enter to open, then Escape restores focus.
  - An OT ref expands inline (`aria-expanded="true"`, text visible), and the URL and `data-day` are unchanged.
  - Greek appears in `bdi[lang="grc"]` with computed direction `ltr`, and the aligned Arabic is shown.
  - No overflow at 320 px with 38 px font.
  - Axe passes in light and dark with the sheet open.
  - A 503 on `study/1.json` shows a retry, and the retry succeeds.
  - Save-Data (`navigator.connection` stub) suppresses the chunk warm-up.
  - The first verse is still ≤ 200 px from the top.
  - The default build shows no AI row.
- **Phase 2 checks:**
  - **Config:** add a third Playwright project with its own `webServer`:
    ```bash
    VITE_AI_PROVIDERS=openrouter VITE_OPENROUTER_API_KEY=test npx vite build --outDir dist-ai && npx vite preview --outDir dist-ai --port 4174 --host 127.0.0.1
    ```
    Run `node scripts/build-readings.js` first. Add `dist-ai/` to `.gitignore`.
  - Stub `https://openrouter.ai/**` with SSE bodies.
  - Assertions: chips stream text; the footer shows the stubbed model; a second tap on the same chip makes no request (cache); the 11th uncached request shows the cap message; a 429 then success moves on to the next model or provider.

---

## 7. Risks and guards

- **Share-alike leak into the bundle:** `data/study/*` is never imported by `src/`. Only `data/books.json` (own data) is.
- **Versification:** OpenBible uses English numbering, so unresolved refs are dropped and counted. NAV bridges keep their labels. TTAraSVD `[c:v]` prefixes are stripped.
- **Alignment drift:** handled by the per-verse fallback plus the 97% gate. If the gate fails, inspect a sample of rejected verses before loosening any threshold, and report to the owner.
- **Performance:** nothing new loads until the first tap. The first tap fetches roughly 40–50 KB gzipped, and the Greek section doesn't wait for the refs file.
- **iOS long-press:** iOS may still fire a click after a long-press selection. The pointerdown selection and duration guards handle this, and it is tested in mobile-webkit.
- **Shared free AI quota:** someone can exhaust it, but it never costs money. Mitigated by the per-device cap and the $10 top-up recommendation.

## 8. Final verification checklist

1. `python3 -I scripts/import-study.py …` passes all gates, and the coverage line is recorded in `data/SOURCES.md`.
2. `npm run format`, then `npm run validate`, then `npm run test:browser` all pass on Chromium and mobile-webkit.
3. Manual check with `npm start` in the in-app browser pane at 390×844:
   - light and dark, 22 px and 38 px text
   - day 1 and the longest day
   - tap verses; check Greek with alignment, NT and OT refs, and NAV including a bridge verse
   - a long-press text selection opens nothing
   - Tab to a verse number, Enter, Escape
4. Run `npm run audit:performance` against the baseline from §2: performance ≥ 87, LCP and CLS not worse, initial JS +< 1 KB gzipped. Record the results in `docs/development.md`.
5. **Phase 2:** the owner puts a real $0-capped key in `.env.local`, which is gitignored by `.env.*`. Run `npm run dev`. Tap each chip on 3 verses and check:
   - the Arabic quality is acceptable
   - the footer model is correct
   - a repeat tap is served from cache
   - the cap message appears at the 11th uncached answer
   - closing the sheet aborts the stream
6. Report to the owner the numbers, the coverage, and anything dropped or loosened, then ask before pushing or opening the PR.
