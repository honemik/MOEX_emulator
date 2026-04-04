# MOEX Standalone App Rebuild Plan

## Goal

Rebuild the MOEX mock exam website as a standalone desktop app that runs on:

- macOS
- Linux/Unix
- Windows

The rebuilt app should:

- preserve the observed MOEX flow and layout patterns
- use the local `database/` folder as the source of truth
- work fully offline after packaging
- support question text, options, answers, explanations, and images

## What We Have

### Live-site behavior already confirmed

The original flow has been inspected live and documented in:

- `docs/moex-live-analysis.md`

Confirmed pages and behaviors:

- login page with on-screen keyboard
- candidate info confirmation page
- score-display option page
- pre-exam waiting page with countdown
- formal single-question exam page
- browse-answer/status page
- two-step end-exam confirmation
- mock no-score result page followed by auto-return to login

### Local data assets

Current `database/` contents:

- `database/cougarbot_exams.sqlite`
- `database/images/`

Observed data facts:

- SQLite DB size is about 50 MB
- image folder contains 1184 `.jpg` files
- DB currently has one table: `questions`
- `questions` row count: `20280`
- distinct `exam_id` count: `234`
- `category` is not useful right now
  - every row has `category = 'Unknown'`

### Current `questions` table schema

`questions` contains:

- `id`
- `category`
- `question_text`
- `question_images`
- `options`
- `explanation_text`
- `explanation_images`
- `raw_json`

### Important raw data structure

`raw_json` includes:

- `exam_id`
- `original_question_number`
- `question`
- `choices`
- `answers`
- `explanation`
- `exam_year`
- `exam_nth_time`
- `tags`
- `question_files`

Practical implications:

- correct answers are already available
- explanations are already available
- image references are already available
- exam grouping exists indirectly through `exam_id`
- human-readable exam catalog metadata is incomplete and must be derived

## Recommended App Architecture

### Recommendation

Build a desktop app with:

- `Tauri`
- `React`
- `TypeScript`

Use Tauri because it is the cleanest path to a true standalone app that still shares one UI codebase across macOS, Linux, and Windows.

### Why this architecture

- It packages as a desktop app, not just a local webpage.
- It can access the bundled SQLite database and image assets locally.
- It keeps the UI layer modern and fast.
- It avoids running a separate local server process in production.
- It lets us keep the MOEX frame-based flow as a single-page app with explicit route/state transitions.

### Backend responsibility

Use the Tauri backend for:

- SQLite queries
- bundling or locating the database file
- resolving image paths
- optional app settings storage
- optional session autosave

### Frontend responsibility

Use the React frontend for:

- screen flow
- countdown and mock-exam state machine
- question rendering
- mark/review state
- browse-answer page
- result page
- image display

## Data Strategy

### Source of truth

Use `database/cougarbot_exams.sqlite` as the primary read-only content source.

Do not manually duplicate the whole dataset into JSON if it can be avoided.

### Cleanup step

Add a preprocessing step that creates a cleaned app-side database or derived dataset from the source SQLite file.

Purpose:

- remove columns that are currently useless for the standalone app
- normalize inconsistent fields
- reduce payload size for packaged distribution
- make frontend queries simpler and more stable

Initial cleanup targets:

- remove or ignore `category` because it is currently always `Unknown`
- flatten JSON fields that are repeatedly needed at runtime
- keep only the fields needed for:
  - exam catalog
  - question rendering
  - answer checking
  - explanation rendering
  - image resolution

Recommended rule:

- keep `database/cougarbot_exams.sqlite` untouched as the raw source
- generate a separate cleaned database during build or first-run import

### Runtime content model

Create a normalized app-side model:

- `Exam`
- `Question`
- `Option`
- `ExplanationBlock`
- `QuestionImage`
- `SessionState`

### Exam catalog problem

There is no dedicated `exams` table and `category` is unusable.

The app should build the exam catalog from:

- `raw_json.exam_id`
- `raw_json.exam_year`
- `raw_json.exam_nth_time`
- `raw_json.tags`
- optionally the image filename prefix when needed for display naming

Plan for a catalog-building layer that produces:

- exam group id
- display title
- subject/tag summary
- question count
- image count

### Image strategy

The DB already stores image references like:

- `./images/115-1-醫學三_Q9_題目_1.jpg`

Use a simple resolver:

- strip the leading `./`
- resolve against `database/`
- serve the image path through Tauri backend commands or a safe local asset mapping

### Explanation rendering

`raw_json.explanation` is serialized rich-text JSON, not plain markdown.

Plan for two passes:

1. Phase 1:
   - render `explanation_text` if present
   - otherwise render a simplified plain-text extraction from `raw_json.explanation`
2. Phase 2:
   - implement a proper renderer for the rich-text block JSON

This keeps the first working app simpler while preserving data fidelity later.

## Product Scope

### Phase 1: faithful MOEX simulator

Rebuild the observed MOEX experience:

- login screen
- candidate info confirmation
- score option screen
- waiting/rules screen
- timed single-question exam screen
- browse-answer status screen
- two-step end-exam confirm
- result/no-score screen

This phase should prioritize accurate interaction flow and layout.

### Phase 2: local study enhancements

Use the existing database answers and explanations to add optional local-only features:

- show score after submit
- show correct answer
- show explanation
- filter by tag
- jump to wrong questions
- resume previous session

Important:

- keep this separate from the MOEX-faithful simulator mode
- the simulator mode should still behave like the observed site when desired

## UI / Screen Plan

### 1. Home / Exam selection

Purpose:

- choose an exam from the local database
- surface human-readable exam metadata

Required work:

- build derived exam catalog
- show exam year, nth time, tags, question count
- optionally show image/question counts

### 2. Mock login page

Purpose:

- mimic MOEX login page visual design
- support manual fake candidate login locally

Required work:

- on-screen keyboard
- candidate ID input
- layout based on the observed legacy page

### 3. Candidate info confirmation page

Purpose:

- show mock candidate and exam information
- allow continue/cancel

### 4. Score-display options page

Purpose:

- preserve the original flow
- store user preference in session state

Behavior:

- in simulator mode, this may still lead to no-score result mode
- in study mode, this can control whether score is revealed immediately

### 5. Waiting / rules page

Purpose:

- show instructions and countdown before entering the exam

Behavior:

- support shortened configurable countdown in local mode
- keep the same visual structure as the live site

### 6. Exam page

Purpose:

- replicate `top_panel.jsp` and `main_panel.jsp`

Required behaviors:

- top info bar
- answered/unanswered counts
- remaining time
- question jump dropdown
- single-question display
- image rendering inside question body
- answer choice selection
- mark state
- next/previous navigation
- cancel answer
- zoom controls
- persisted per-question state

### 7. Browse-answer page

Purpose:

- replicate `ExamStatus.jsp`

Required behaviors:

- grid of question numbers
- answer status summary
- unanswered highlighting
- return to current exam

### 8. End exam flow

Purpose:

- replicate the two-step confirmation behavior

Required behaviors:

- first confirmation modal/page
- second confirmation modal/page
- cancel path returns to exam
- confirm path submits session

### 9. Result page

Two result modes should exist:

- MOEX simulator mode:
  - no-score result page
  - optional auto-return to login
- local study mode:
  - scored result page
  - score summary
  - answer review and explanations

## Database Access Plan

### Read strategy

Use direct SQLite reads through the Tauri backend.

Main query patterns:

- list distinct exams
- load all questions for one exam
- load one question by exam and original question number

### Normalization strategy

On exam load:

- parse `options` JSON
- parse `question_images`
- parse `explanation_images`
- parse `raw_json`
- derive correct answer label from `raw_json.answers`

### Needed derived fields

For each question, derive:

- display question number
- exam id
- exam year
- exam nth time
- tags
- correct option label
- whether question has images
- whether explanation has images

## Packaging Plan

### Bundled assets

Bundle with the app:

- `cougarbot_exams.sqlite`
- `database/images/`

### First-run behavior

Recommended:

- copy the bundled SQLite DB to the app data directory only if future writes are needed
- otherwise keep content read-only and store session data separately

For Phase 1, preferred approach:

- leave DB read-only
- store session/progress/settings in a separate local store

## Implementation Phases

### Phase A: foundation

- scaffold Tauri + React + TypeScript app
- define shared domain models
- add backend command layer for SQLite and image resolution
- create a small test page that loads one question and one image

### Phase B: data integration

- add a database-cleaning/import pipeline that produces a derived app database
- implement exam catalog builder
- implement question loader by exam id
- implement explanation parser fallback
- verify image resolution against real files

### Phase C: MOEX simulator shell

- implement MOEX-style layout system
- implement login page
- implement info confirmation page
- implement score option page
- implement waiting page

### Phase D: exam engine

- implement timer/session state machine
- implement answer persistence
- implement mark state
- implement question navigation
- implement browse-answer grid
- implement end-exam flow

### Phase E: results and review

- implement no-score result page
- implement optional scored result page
- implement explanation/review page

### Phase F: packaging and QA

- build desktop bundles for macOS, Linux, Windows
- verify app startup with bundled DB and images
- test with image-heavy exams
- test with long explanations

## Technical Risks

### 1. Exam naming is incomplete

Risk:

- there is no dedicated exam metadata table
- `category` is unusable

Mitigation:

- derive display labels from year, nth time, tags, and optionally filename patterns
- if necessary, add a small local metadata mapping file later

### 2. Explanation format is rich-text JSON

Risk:

- explanation content is not plain text in all cases

Mitigation:

- start with a plain-text fallback renderer
- add a richer block renderer in a later phase

### 3. Image-heavy questions

Risk:

- large image payloads may affect responsiveness

Mitigation:

- lazy-load images
- precompute image dimensions
- cache image resolution results

### 4. Fidelity versus usability

Risk:

- exact MOEX mimicry conflicts with modern desktop usability

Mitigation:

- keep a faithful simulator mode
- add optional study enhancements as a separate mode, not mixed into simulator behavior

## Recommended Deliverable Order

Build in this order:

1. question loader from SQLite
2. database cleanup / derived-db generator
3. image resolver
4. exam catalog
5. simulator shell pages
6. exam page interactions
7. browse-answer page
8. end-exam flow
9. no-score result page
10. optional scored result and review mode
11. packaging

## Definition Of Done

The rebuild is ready when:

- the app runs as a packaged desktop app on macOS, Linux, and Windows
- it loads exams from `database/cougarbot_exams.sqlite`
- it displays linked images from `database/images`
- it reproduces the observed MOEX page flow
- it supports answer, mark, jump, browse-answer, and end-exam interactions
- it can finish an exam fully offline
- it supports an optional local review/score mode using the existing answer data
