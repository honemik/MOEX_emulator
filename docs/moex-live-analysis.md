# MOEX Live Site Analysis And Interaction Log

Last updated: 2026-04-04

## Purpose

This document records the live inspection of the MOEX mock exam site at:

- `https://cbtpw.moex.gov.tw/PWWeb/ExamPractice.jsp`

The goal was to:

- map the real page flow and DOM structure
- confirm the actual exam page layout instead of inferring from screenshots alone
- exercise the visible interactions on the real single-question exam page
- save screenshots for later UI reconstruction work

Artifacts are stored in:

- `output/playwright/moex-live/`

## High-Level Flow

Observed live flow after user-entered captcha:

1. `ExamPractice.jsp`
2. new tab `portal/index.jsp?isExamSimulate=true&Class_code=t312&Subject_code=31200001&code=XYQ9`
3. `mainFrame -> login.jsp`
4. `mainFrame -> information.jsp`
5. `mainFrame -> information2.jsp`
6. pre-exam waiting:
   - `topFrame -> top_panel2.jsp`
   - `mainFrame -> main_panel_practice.jsp`
7. formal exam:
   - `topFrame -> top_panel.jsp`
   - `mainFrame -> main_panel.jsp`

## Process Timeline

### First pass

- Public outer pages were fetched directly and confirmed to use a very old `frameset + JSP + table layout + image slices` architecture.
- The public pages that were confirmed before entering the real exam UI:
  - `ExamPractice.jsp`
  - `portal/head.jsp`
  - `portal/PW2001_01.jsp`
  - `portal/login.jsp`
  - `portal/information.jsp`
  - `portal/information2.jsp`
  - `portal/practice_frame.jsp`
- The first live browser attempt reached the pre-exam waiting page but did not reliably advance into the real question page.
- During that first attempt, a frame/reference issue was observed:
  - `top.mainFrame.hasStartExam is not a function`
- That suggested a legacy frame-calling problem during transition from waiting mode to exam mode.

### Clean retry

- The browser session was closed and reopened with a clean Playwright session.
- The captcha was user-entered manually.
- A fake Taiwan ID value was then entered programmatically:
  - `A123456789`
- That value was accepted by the mock flow and advanced normally.
- The clean retry successfully passed through:
  - candidate info page
  - score-display option page
  - pre-exam waiting page
  - automatic countdown into the formal exam page

## Confirmed DOM And Frame Structure

### Outer shell

The tab `portal/index.jsp?...` uses five top-level frames:

1. `topFrame`
2. `mainFrame`
3. `codeFrame`
4. `hbFrame`
5. `MessageFrame`

### Candidate info page

`mainFrame -> information.jsp`

Observed characteristics:

- one `form1`
- `action="information2.jsp"`
- two image-style links:
  - `doBrowserule`
  - `doCancel`
- visible fields are not editable inputs; they are rendered as text rows:
  - exam name
  - class
  - subject
  - candidate name
  - seat number
  - exam seat

### Score-display option page

`mainFrame -> information2.jsp`

Observed characteristics:

- one `form1`
- `action="practice_frame.jsp"`
- radio groups:
  - `ShowScore`
  - `ShowAllScore`
- default observed values:
  - `ShowScore = 0`
  - `ShowAllScore = 0`
- confirmation is triggered by an image link calling:
  - `sendData()`

### Pre-exam waiting page

Transition after `information2.jsp`:

- `topFrame -> top_panel2.jsp`
- `mainFrame -> main_panel_practice.jsp`

Observed characteristics:

- top bar shows candidate and exam metadata plus countdown
- waiting page shows:
  - welcome text
  - trial-answer/waiting instructions
  - trial entry points using `doPractice`
  - exam rule text
- `top_panel2.jsp` controls a countdown via `clock()`
- observed live values included:
  - `TimeCountdown = 61`
  - `preState = '2'`

Important transition logic observed in `top_panel2.jsp`:

- when countdown < 30 seconds:
  - `top.mainFrame.willStartExam()`
- when countdown reaches 0:
  - `top.mainFrame.hasStartExam()`
  - `top.codeFrame.doExamStart(form1)`

### Formal single-question exam page

Automatic transition after countdown:

- `topFrame -> top_panel.jsp`
- `mainFrame -> main_panel.jsp`

#### Top panel

`top_panel.jsp` shows:

- exam name
- class
- candidate name
- exam seat
- subject
- seat number
- total question count
- answered count
- unanswered count
- remaining time

Observed example:

- total questions: `80`
- answered: `0`
- unanswered: `80`
- remaining time at first capture: `00:59:42`

#### Main panel

`main_panel.jsp`

Observed structure:

- body class: `acer_body`
- main wrapper table width: `94%`
- visible sections:
  - mark controls
  - question number jump control
  - current question header
  - zoom controls
  - question stem
  - four answer options
  - image-style navigation buttons

Observed exam-page forms:

1. `formMark`
   - mark radios: `Markradio_1`, `Markradio_2`, `Markradio_3`, `Markradio_0`
2. `form_0`
   - answer radios: `itemRadio` with values `1..4`
3. `form1`
   - action: `/portal/responseAnswer`
   - hidden fields: `userAns`, `answers`, `marks`, `qCoursor`
4. `form2`
   - action: `/portal/nextQuestionAction`
   - hidden fields: `subject_code`, `questionNo`
5. `form3`
   - action: `/portal/cancelAnswer`
6. `form4`
   - action: `/portal/responseMark`
7. `form5`
   - action: `/portal/doPageZoomSize`
   - hidden field: `PageZoomSize`

Observed select:

- `selectQ`
- used to jump between question numbers

## Confirmed Interaction Functions

The following real client-side functions were extracted from `main_panel.jsp`:

- `setMark(mark)`
  - calls `tmweb.ajaxStateFlow(form4, 'doResponseMark')`
- `setData(userAns, form_k, qCoursor, questionType, k)`
  - for single choice, maps `1..4` to `A..D`
  - calls `tmweb.ajaxStateFlow(form1, 'doResponseAnswer')`
- `nextQuest(questionType)`
  - calls `tmweb.ajaxStateFlow(form2, 'doNextQuestion')`
- `upQuest(questionType)`
  - calls `tmweb.ajaxStateFlow(form2, 'doUpQuestion')`
- `changeQues(questionNo, questionType)`
  - calls `tmweb.ajaxStateFlow(form2, 'doGoQuestion')`
- `cancelData(questionType)`
  - clears checked radios
  - calls `tmweb.ajaxStateFlow(form3, 'doCancelAnswer')`
- `PageZoomMore()`
  - updates `PageZoomSize`
  - calls `tmweb.ajaxStateFlow(form5, 'doPageZoomSize')`
- `PageZoom100()`
  - resets zoom to `100`
  - calls `tmweb.ajaxStateFlow(form5, 'doPageZoomSize')`
- `PageZoomLess()`
  - decreases zoom if above `100`
  - calls `tmweb.ajaxStateFlow(form5, 'doPageZoomSize')`

The following top-panel functions were extracted from `top_panel.jsp`:

- `doBrowseAnswer()`
  - calls `tmweb.ajaxStateFlow(form1, 'doBrowseAnswer')`
  - hides `doBrowseAnswer`
  - shows `doContinueAnswer`
- `doContinueAnswer()`
  - calls `tmweb.ajaxStateFlow(form1, 'doContinueAnswer')`
  - shows `doBrowseAnswer`
  - hides `doContinueAnswer`
- `doExamineeEndExam()`
  - calls `top.showEndExamConfirm()`
- `OverTimeCountdown()`
  - when `examOverTimeCountdown` reaches `0`, it shows the `doEndExam` control

## Interaction Log

All steps below were performed on the live formal exam page.

| Step | Action | Trigger used | Observed result | Screenshot |
|---|---|---|---|---|
| 00 | Baseline capture | none | Question `1`, zoom `100%`, answer `null`, mark `0`, answered `0`, unanswered `80` | `output/playwright/moex-live/step-00-baseline.png` |
| 01 | Zoom less at 100% | `PageZoomLess()` | No state change. Zoom remained `100%`. Answer and counts unchanged. | `output/playwright/moex-live/step-01-zoom-less-no-change.png` |
| 02 | Zoom more | `PageZoomMore()` | Zoom changed from `100%` to `150%`. No answer or count changes. | `output/playwright/moex-live/step-02-zoom-more-150.png` |
| 03 | Zoom reset | `PageZoom100()` | Zoom returned from `150%` to `100%`. | `output/playwright/moex-live/step-03-zoom-reset-100.png` |
| 04 | Set mark 1 on Q1 | `setMark('1')` | Current mark changed from `0` to `1`. No answer/count change. | `output/playwright/moex-live/step-04-mark-1.png` |
| 05 | Answer Q1 with B | `setData(2, 'form_0', '1', 1, 0)` | Selected answer became radio value `2` = `(B)`. Top counts changed to answered `1`, unanswered `79`. | `output/playwright/moex-live/step-05-answer-b-q1.png` |
| 06 | Go to next question | `nextQuest('1')` | Landed on question `2`. Selected answer cleared on new question. Mark reset to `0` for that question. Top counts stayed `1/79`. | `output/playwright/moex-live/step-06-next-question-q2.png` |
| 07 | Return to previous question | `upQuest('1')` | Returned to question `1`. Stored answer `(B)` and mark `1` both reappeared. Top counts stayed `1/79`. | `output/playwright/moex-live/step-07-up-question-back-q1.png` |
| 08 | Jump request to question 5 | `changeQues('5', '1')` | Unexpected behavior: landed on question `4`, not question `5`. Counts remained `1/79`. | `output/playwright/moex-live/step-08-jump-request-5-landed-4.png` |
| 09 | Jump back to question 1 | `changeQues('1', '1')` | Returned to question `1`. Stored answer `(B)` and mark `1` were still present. | `output/playwright/moex-live/step-09-jump-back-q1.png` |
| 10 | Cancel answer on Q1 | `cancelData('1')` | Answer cleared. Mark `1` remained. Top counts returned to answered `0`, unanswered `80`. | `output/playwright/moex-live/step-10-cancel-answer-q1.png` |
| 11 | Clear mark on Q1 | `setMark('0')` | Mark returned to `0`. Final page returned to clean state: Q1, zoom `100%`, no answer, no mark, `0/80`. | `output/playwright/moex-live/step-11-clear-mark-q1.png` |
| 12 | Browse answer status | `doBrowseAnswer()` | `mainFrame` switched from `main_panel.jsp` to `ExamStatus.jsp`. `doBrowseAnswer` was hidden and `doContinueAnswer` was shown. The page displayed a grid of question numbers and answer-status cells. | `output/playwright/moex-live/step-12-browse-answer-examstatus.png` |
| 13 | End exam first prompt | `doExamineeEndExam()` | `mainFrameset.rows` changed to `0,0,0,0,*`, leaving only `MessageFrame` visible. Prompt text: `注意：結束作答視同繳卷 是否結束本次應考？` | `output/playwright/moex-live/step-13-end-exam-confirm-prompt.png` |
| 14 | End exam second prompt | `EndExamconfirm1()` | Still only `MessageFrame` visible. Prompt text changed to `再次確認是否結束本次應考？` | `output/playwright/moex-live/step-14-end-exam-second-confirm.png` |
| 15 | Auto-return after end | `realEndExam()` | Immediately after submission, a transient state was captured with `topFrame -> top.jsp` and `mainFrame -> ExamResultNoScore.jsp`, showing `本節考試結束!`. Shortly afterward the page auto-returned to `login.jsp`. The saved screenshot shows the auto-returned login page, not the transient result page. | `output/playwright/moex-live/step-15-post-end-auto-return-login.png` |
| 16 | Score-enabled retest | `ShowScore=1`, `ShowAllScore=1`, then `realEndExam()` | Even with both score-display options set to `是`, the submission still landed on `ExamResultNoScore.jsp`. This confirms the mock site does not expose a scored result page in this flow. | `output/playwright/moex-live/step-16-result-noscore-even-when-score-enabled.png` |

## Key Behavioral Findings

- Answer submission is immediate.
  - Selecting an answer via `setData(...)` immediately changed the top answered/unanswered counters.
- Marking is independent from answering.
  - A mark can exist without an answer.
  - `cancelData('1')` clears the answer but does not clear the mark.
- Answer and mark persist per question across navigation.
  - `nextQuest` and `upQuest` preserved both the answer and the mark on question 1.
- Zoom is stored separately.
  - `PageZoomMore()` changed displayed zoom to `150%`.
  - `PageZoom100()` forcibly reset to `100%`.
  - `PageZoomLess()` does nothing when already at `100%`.
- Jump navigation showed one anomaly during scripted testing.
  - `changeQues('5', '1')` landed on question `4`.
  - `changeQues('1', '1')` returned correctly to question `1`.
  - This should be re-verified later using a literal user-triggered `<select>` change event instead of direct function invocation, to determine whether the discrepancy is a server-side off-by-one or a helper-call nuance.
- Browse-answer mode is a separate page, not an overlay.
  - `doBrowseAnswer()` switches `mainFrame` to `ExamStatus.jsp`.
  - The top panel toggles from `doBrowseAnswer` to `doContinueAnswer`.
  - Returning from status mode correctly restores `main_panel.jsp`.
- End-exam flow uses a two-step confirmation inside `MessageFrame`.
  - First prompt: `是否結束本次應考？`
  - Second prompt: `再次確認是否結束本次應考？`
  - Cancelling the prompt restores `mainFrameset.rows` to `173,*,0,0,0` and returns to the active exam UI.
- The actual submit after the second confirmation is fast and transitions through a transient no-score result page.
  - Immediately after `realEndExam()`, the captured state was:
    - `topFrame -> top.jsp`
    - `mainFrame -> ExamResultNoScore.jsp`
  - The observed result text included:
    - `本節考試結束!`
  - That result page then auto-returned to `login.jsp` quickly enough that the screenshot captured the returned login page rather than the transient result page.
- Enabling score display does not change the mock result page.
  - A dedicated retest was run with:
    - `ShowScore = 1`
    - `ShowAllScore = 1`
  - The post-submit target still resolved to:
    - `ExamResultNoScore.jsp`
  - This matches the earlier note on `information2.jsp`:
    - `本練習為模擬作答，不提供顯示成績的畫面，正式考試時才提供`

## Rebuild Implications

For the local cross-platform rebuild, the real app flow should be modeled as:

1. captcha entry page
2. login page with on-screen keyboard
3. candidate info confirmation page
4. score-display option page
5. pre-exam waiting/rules page with countdown
6. formal single-question exam page

The formal exam page should preserve these core behaviors:

- fixed information bar across the top
- single-question presentation
- answered/unanswered counters
- question jump dropdown
- per-question mark state
- immediate answer save
- cancel answer without clearing mark
- next/previous navigation with persistence
- zoom controls
- 80-question style flow for this observed subject
- separate browse-answer/status mode reachable from the top panel
- two-step end-exam confirmation flow
- no-score result page in mock mode, followed by auto-return to login

## Final Live State At End Of This Session

After the last cleanup step, the page was left in this state:

- after the first interaction batch, the page had been reset to:
  - question `1`
  - zoom `100%`
  - no answer
  - no mark
  - answered `0`
  - unanswered `80`
- after the later end-exam test, the live session transitioned through:
  - `ExamResultNoScore.jsp`
  - then auto-returned to `login.jsp`
