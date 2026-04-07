import {
  Suspense,
  lazy,
  startTransition,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { ExamCard } from "./components/ExamCard";
import { ImageAsset } from "./components/ImageAsset";
import { LegacyKeyboard } from "./components/LegacyKeyboard";
import { MathText } from "./components/MathText";
import { Modal } from "./components/Modal";
import { QuestionPanel } from "./components/QuestionPanel";
import { StatusGrid } from "./components/StatusGrid";
import {
  formatResultStateLabel,
  getAnswerLabels,
  getQuestionResultState,
  isQuestionCorrect,
  normalizeSelectedAnswers,
  sameAnswers,
} from "./lib/examResults";
import {
  bootstrapCatalog,
  debugDataPaths,
  formatDataPathDebug,
  loadExam,
  normalizeInvokeError,
} from "./lib/api";
import { useCatalogSearch } from "./hooks/useCatalogSearch";
import {
  buildLegacySessionKeys,
  buildSessionKey,
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from "./lib/storage";
import type {
  AppScreen,
  ExamCatalogItem,
  ExamPayload,
  ExamSession,
  InitializationPayload,
  QuestionMark,
  QuestionRecord,
  ResultSummary,
} from "./lib/types";

interface CandidateProfile {
  idNumber: string;
  name: string;
  seatNumber: string;
  admissionTicket: string;
}

type ResultTab = "summary" | "record" | "review" | "download";

const AnswerSheetDownloadPanel = lazy(() => import("./components/AnswerSheetDownloadPanel"));

const WAITING_SECONDS = 61;
const SUBJECT_FILTER_OPTIONS = [
  { value: "", label: "全部科目" },
  { value: "醫學一", label: "醫師1" },
  { value: "醫學二", label: "醫師2" },
  { value: "醫學三", label: "醫師3" },
  { value: "醫學四", label: "醫師4" },
  { value: "醫學五", label: "醫師5" },
  { value: "醫學六", label: "醫師6" },
];
const MARK_SHAPE_BY_VALUE: Record<number, string> = {
  1: "triangle",
  2: "circle",
  3: "square",
};

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((Math.max(0, totalSeconds) % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.max(0, totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function sanitizeCandidateId(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

function isCandidateIdValid(value: string) {
  return /^[A-Z][A-Z0-9]{9}$/.test(value);
}

function buildCandidateProfile(idNumber: string) {
  return {
    idNumber,
    name: "應考人 先生/女士",
    seatNumber: "A01",
    admissionTicket: "10100001",
  };
}

function normalizeSessionForQuestions(session: ExamSession, questions: QuestionRecord[]) {
  let changed = false;
  const questionsByNumber = new Map(questions.map((question) => [question.questionNumber, question]));
  const normalizedAnswers = Object.fromEntries(
    Object.entries(session.answers).map(([questionNumber, selected]) => {
      const numericQuestionNumber = Number(questionNumber);
      const question = questionsByNumber.get(numericQuestionNumber);
      const nextSelected = question ? normalizeSelectedAnswers(question, selected) : selected;
      if (!sameAnswers(selected, nextSelected)) {
        changed = true;
      }

      return [numericQuestionNumber, nextSelected];
    }),
  ) as Record<number, number[]>;

  return changed
    ? {
        ...session,
        answers: normalizedAnswers,
      }
    : session;
}

function summarizeResult(questions: QuestionRecord[], answers: Record<number, number[]>) {
  let answered = 0;
  let correct = 0;

  for (const question of questions) {
    const selected = answers[question.questionNumber] ?? [];
    if (selected.length > 0) {
      answered += 1;
    }

    if (isQuestionCorrect(question, answers)) {
      correct += 1;
    }
  }

  const total = questions.length;
  const unanswered = total - answered;
  const incorrect = answered - correct;
  const scorePercent = total > 0 ? Number(((correct / total) * 100).toFixed(1)) : 0;

  return {
    total,
    answered,
    correct,
    incorrect,
    unanswered,
    scorePercent,
  } satisfies ResultSummary;
}

function formatPreparedAt(timestamp: string) {
  const asNumber = Number(timestamp);
  if (Number.isNaN(asNumber)) {
    return timestamp;
  }

  return new Date(asNumber * 1000).toLocaleString("zh-TW");
}


function getElapsedSeconds(session: ExamSession | null, fallbackTotalSeconds: number) {
  if (!session) {
    return 0;
  }

  const startedAt = Date.parse(session.startedAt);
  const endedAt = session.endedAt ? Date.parse(session.endedAt) : Number.NaN;

  if (!Number.isNaN(startedAt) && !Number.isNaN(endedAt) && endedAt >= startedAt) {
    return Math.floor((endedAt - startedAt) / 1000);
  }

  return Math.max(0, fallbackTotalSeconds - session.remainingSeconds);
}

function App() {
  const bootstrapStarted = useRef(false);
  const [screen, setScreen] = useState<AppScreen>("home");
  const [initPayload, setInitPayload] = useState<InitializationPayload | null>(null);
  const [catalog, setCatalog] = useState<ExamCatalogItem[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamCatalogItem | null>(null);
  const [examPayload, setExamPayload] = useState<ExamPayload | null>(null);
  const [candidateInput, setCandidateInput] = useState("");
  const [candidate, setCandidate] = useState<CandidateProfile | null>(null);
  const [showAllScore, setShowAllScore] = useState(false);
  const [waitingSeconds, setWaitingSeconds] = useState(WAITING_SECONDS);
  const [examSession, setExamSession] = useState<ExamSession | null>(null);
  const [savedSession, setSavedSession] = useState<ExamSession | null>(null);
  const [resultSummary, setResultSummary] = useState<ResultSummary | null>(null);
  const [reviewQuestionNumber, setReviewQuestionNumber] = useState(1);
  const [resultTab, setResultTab] = useState<ResultTab>("summary");
  const [endConfirmStep, setEndConfirmStep] = useState<0 | 1 | 2>(0);
  const [busyMessage, setBusyMessage] = useState<string | null>("載入題庫中...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timedOutSubmission, setTimedOutSubmission] = useState(false);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [attemptFilter, setAttemptFilter] = useState("");

  const sessionStorageKey = useMemo(
    () => (selectedExam && candidate ? buildSessionKey(selectedExam.examId, candidate.idNumber) : null),
    [selectedExam?.examId, candidate?.idNumber],
  );
  const savedSessionKeys = useMemo(
    () =>
      selectedExam && candidate
        ? [
            buildSessionKey(selectedExam.examId, candidate.idNumber),
            ...buildLegacySessionKeys(selectedExam.examId, candidate.idNumber),
          ]
        : [],
    [selectedExam?.examId, candidate?.idNumber],
  );

  const currentQuestion =
    examPayload?.questions.find((question) => question.questionNumber === examSession?.currentQuestion) ?? null;
  const reviewQuestion =
    examPayload?.questions.find((question) => question.questionNumber === reviewQuestionNumber) ?? null;
  const answeredCount =
    examPayload?.questions.filter((question) => (examSession?.answers[question.questionNumber] ?? []).length > 0)
      .length ?? 0;
  const totalQuestions = examPayload?.questions.length ?? 0;
  const unansweredCount = Math.max(0, totalQuestions - answeredCount);
  const shouldShowResultScore = showAllScore;
  const shouldShowResultRecord = showAllScore;
  const elapsedSeconds = getElapsedSeconds(examSession, totalQuestions * 60);
  const elapsedLabel = formatDuration(elapsedSeconds);
  const exportGeneratedAtLabel = new Date().toLocaleString("zh-TW");
  const {
    normalizedSearch,
    searchResults,
    searchResultsQuery,
    searchLoading,
  } = useCatalogSearch({
    query: search,
    onError: setErrorMessage,
  });
  const catalogForDisplay = normalizedSearch
    ? searchResultsQuery === normalizedSearch
      ? searchResults
      : []
    : catalog;
  const yearOptions = useMemo(
    () =>
      [...new Set(catalog.map((exam) => exam.rocYear).filter((year): year is number => year !== null))]
        .sort((left, right) => right - left)
        .map((year) => String(year)),
    [catalog],
  );
  const visibleCatalog = useMemo(
    () =>
      catalogForDisplay.filter((exam) => {
        if (yearFilter && String(exam.rocYear ?? "") !== yearFilter) {
          return false;
        }

        if (subjectFilter && exam.inferredSubject !== subjectFilter) {
          return false;
        }

        if (attemptFilter && String(exam.examNthTime ?? "") !== attemptFilter) {
          return false;
        }

        return true;
      }),
    [attemptFilter, catalogForDisplay, subjectFilter, yearFilter],
  );

  useEffect(() => {
    if (bootstrapStarted.current) {
      return;
    }
    bootstrapStarted.current = true;

    let active = true;

    async function bootstrap() {
      try {
        const bootstrap = await bootstrapCatalog();
        if (!active) {
          return;
        }

        setInitPayload(bootstrap.initialization);
        setCatalog(bootstrap.exams);
      } catch (error) {
        if (active) {
          const baseMessage = `初始化失敗：${normalizeInvokeError(error)}`;
          try {
            const diagnostics = await debugDataPaths();
            if (active) {
              setErrorMessage(`${baseMessage}\n\n${formatDataPathDebug(diagnostics)}`);
            }
          } catch (diagnosticError) {
            if (active) {
              setErrorMessage(
                `${baseMessage}\n\n診斷資訊取得失敗：${normalizeInvokeError(diagnosticError)}`,
              );
            }
          }
        }
      } finally {
        if (active) {
          setBusyMessage(null);
        }
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (savedSessionKeys.length === 0) {
      setSavedSession(null);
      return;
    }

    const loaded = loadStoredSession(savedSessionKeys);
    setSavedSession(loaded && examPayload ? normalizeSessionForQuestions(loaded, examPayload.questions) : loaded);
  }, [savedSessionKeys, examPayload]);

  const tickWaitingClock = useEffectEvent(() => {
    setWaitingSeconds((current) => {
      if (current <= 0) {
        return 0;
      }
      return current - 1;
    });
  });

  useEffect(() => {
    if (screen !== "waiting") {
      return;
    }

    if (waitingSeconds === 0 && examPayload) {
      const fallbackDuration = examPayload.questions.length * 60;
      const nextSession =
        savedSession && !savedSession.completed
          ? savedSession
          : {
              currentQuestion: 1,
              remainingSeconds: fallbackDuration,
              zoom: 100,
              answers: {},
              marks: {},
              completed: false,
              startedAt: new Date().toISOString(),
            };
      setExamSession(nextSession);
      setReviewQuestionNumber(nextSession.currentQuestion);
      setScreen("exam");
      return;
    }

    const timeoutId = window.setTimeout(() => tickWaitingClock(), 1000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [screen, waitingSeconds, examPayload, savedSession, tickWaitingClock]);

  const tickExamClock = useEffectEvent(() => {
    setExamSession((current) => {
      if (!current || current.completed) {
        return current;
      }

      return {
        ...current,
        remainingSeconds: Math.max(0, current.remainingSeconds - 1),
      };
    });
  });

  useEffect(() => {
    if (!examSession || !["exam", "browse"].includes(screen)) {
      return;
    }

    const intervalId = window.setInterval(() => tickExamClock(), 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [screen, Boolean(examSession), tickExamClock]);

  const completeExam = useEffectEvent((timedOut: boolean) => {
    if (!examPayload || !examSession) {
      return;
    }

    const summary = summarizeResult(examPayload.questions, examSession.answers);
    setResultSummary(summary);
    setTimedOutSubmission(timedOut);
    setReviewQuestionNumber(examSession.currentQuestion);
    setResultTab("summary");
    setExamSession((current) =>
      current
        ? {
            ...current,
            completed: true,
            endedAt: new Date().toISOString(),
          }
        : current,
    );
    if (sessionStorageKey) {
      clearStoredSession(sessionStorageKey);
    }
    setSavedSession(null);
    setEndConfirmStep(0);
    setScreen("result");
  });

  useEffect(() => {
    if (!examSession || examSession.completed) {
      return;
    }

    if (!["exam", "browse"].includes(screen)) {
      return;
    }

    if (examSession.remainingSeconds === 0) {
      completeExam(true);
    }
  }, [screen, examSession?.remainingSeconds, examSession?.completed, completeExam]);

  useEffect(() => {
    if (!sessionStorageKey || !examSession) {
      return;
    }

    if (examSession.completed) {
      clearStoredSession(sessionStorageKey);
      setSavedSession(null);
      return;
    }

    saveStoredSession(sessionStorageKey, examSession);
  }, [sessionStorageKey, examSession]);

  function resetFlowState() {
    setCandidateInput("");
    setCandidate(null);
    setShowAllScore(false);
    setWaitingSeconds(WAITING_SECONDS);
    setExamSession(null);
    setSavedSession(null);
    setResultSummary(null);
    setReviewQuestionNumber(1);
    setResultTab("summary");
    setTimedOutSubmission(false);
    setEndConfirmStep(0);
  }

  function resetToHome() {
    resetFlowState();
    setSelectedExam(null);
    setExamPayload(null);
    setScreen("home");
  }

  function resetToLogin() {
    resetFlowState();
    setScreen("login");
  }

  async function handleSelectExam(exam: ExamCatalogItem) {
    setErrorMessage(null);
    setBusyMessage("載入題庫中...");

    try {
      const payload = await loadExam(exam.examId);
      startTransition(() => {
        setSelectedExam(payload.exam);
        setExamPayload(payload);
        resetFlowState();
        setScreen("login");
      });
    } catch (error) {
      setErrorMessage(`題庫載入失敗：${normalizeInvokeError(error)}`);
    } finally {
      setBusyMessage(null);
    }
  }

  function handleCandidateContinue() {
    const sanitized = sanitizeCandidateId(candidateInput);
    if (!isCandidateIdValid(sanitized)) {
      setErrorMessage("請輸入 1 碼英文字加 9 碼英數字的模擬身分證號。");
      return;
    }

    setErrorMessage(null);
    setCandidateInput(sanitized);
    setCandidate(buildCandidateProfile(sanitized));
    setScreen("confirm");
  }

  function handleStartWaiting() {
    setWaitingSeconds(WAITING_SECONDS);
    setScreen("waiting");
  }

  function setCurrentQuestion(questionNumber: number) {
    setExamSession((current) =>
      current
        ? {
            ...current,
            currentQuestion: questionNumber,
          }
        : current,
    );
  }

  function handleToggleAnswer(answerIndex: number) {
    if (!currentQuestion) {
      return;
    }

    setExamSession((current) => {
      if (!current) {
        return current;
      }

      const existingAnswers = current.answers[currentQuestion.questionNumber] ?? [];
      const nextAnswers = normalizeSelectedAnswers(
        currentQuestion,
        currentQuestion.isMultipleChoice
          ? existingAnswers.includes(answerIndex)
            ? existingAnswers.filter((item) => item !== answerIndex)
            : [...existingAnswers, answerIndex]
          : [answerIndex],
      );

      return {
        ...current,
        answers: {
          ...current.answers,
          [currentQuestion.questionNumber]: nextAnswers,
        },
      };
    });
  }

  function handleSelectMark(mark: QuestionMark) {
    if (!currentQuestion) {
      return;
    }

    setExamSession((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        marks: {
          ...current.marks,
          [currentQuestion.questionNumber]: mark,
        },
      };
    });
  }

  function handleCancelAnswer() {
    if (!currentQuestion) {
      return;
    }

    setExamSession((current) => {
      if (!current) {
        return current;
      }

      const nextAnswers = { ...current.answers };
      delete nextAnswers[currentQuestion.questionNumber];

      return {
        ...current,
        answers: nextAnswers,
      };
    });
  }

  function handleZoomChange(nextZoom: number) {
    setExamSession((current) =>
      current
        ? {
            ...current,
            zoom: nextZoom,
          }
        : current,
    );
  }

  function stepQuestion(delta: number) {
    if (!examSession) {
      return;
    }

    const nextQuestion = Math.min(Math.max(1, examSession.currentQuestion + delta), totalQuestions);
    setCurrentQuestion(nextQuestion);
  }

  function renderResultReview(question: QuestionRecord) {
    const selectedAnswers = examSession?.answers[question.questionNumber] ?? [];
    const resultState = getQuestionResultState(question, examSession?.answers ?? {});

    return (
      <div className="review-panel">
        <div className="review-heading">
          <strong>第 {question.questionNumber} 題</strong>
          <span className={`review-status ${resultState}`}>{formatResultStateLabel(resultState)}</span>
        </div>
        <MathText className="review-question-text" text={question.questionText} />

        {question.questionImages.length > 0 ? (
          <div className="image-stack">
            {question.questionImages.map((imagePath, index) => (
              <ImageAsset
                alt={`檢討題目圖片 ${index + 1}`}
                className="question-image"
                key={`${question.id}-review-question-${imagePath}`}
                relativePath={imagePath}
              />
            ))}
          </div>
        ) : null}

        <div className="review-choice-list">
          {question.options.map((option, index) => {
            const selected = selectedAnswers.includes(index);
            const correctOption = question.correctAnswerIndices.includes(index);

            return (
              <div
                className={[
                  "review-choice",
                  selected ? "selected" : "",
                  correctOption ? "correct" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={`${question.id}-review-${option.label}`}
              >
                <strong>{option.label}</strong>
                <MathText as="span" text={option.text} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderResultRecord() {
    if (!examPayload || !examSession) {
      return null;
    }

    return (
      <div className="result-record-layout">
        <div className="result-record-grid">
          <StatusGrid
            onSelectQuestion={(questionNumber) => {
              setReviewQuestionNumber(questionNumber);
              setResultTab("review");
            }}
            questions={examPayload.questions}
            session={{
              ...examSession,
              currentQuestion: reviewQuestionNumber,
            }}
          />
        </div>

        <div className="result-record-table-wrap">
          <table className="result-record-table">
            <thead>
              <tr>
                <th>題號</th>
                <th>你的答案</th>
                <th>正確答案</th>
                <th>結果</th>
                <th>註記</th>
                <th>檢視</th>
              </tr>
            </thead>
            <tbody>
              {examPayload.questions.map((question) => {
                const resultState = getQuestionResultState(question, examSession.answers);
                const selectedAnswers = examSession.answers[question.questionNumber] ?? [];
                const mark = examSession.marks[question.questionNumber] ?? 0;

                return (
                  <tr key={`record-${question.id}`}>
                    <td>{question.questionNumber}</td>
                    <td>{getAnswerLabels(question, selectedAnswers) || "未作答"}</td>
                    <td>{question.correctLabels.join("、") || "無"}</td>
                    <td>
                      <span className={`record-state ${resultState}`}>{formatResultStateLabel(resultState)}</span>
                    </td>
                    <td>{mark > 0 ? `註記 ${mark}` : "-"}</td>
                    <td>
                      <button
                        className="record-jump-link"
                        type="button"
                        onClick={() => {
                          setReviewQuestionNumber(question.questionNumber);
                          setResultTab("review");
                        }}
                      >
                        檢視
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderResultReviewWorkspace() {
    if (!examPayload || !examSession || !reviewQuestion) {
      return null;
    }

    const currentIndex = examPayload.questions.findIndex(
      (question) => question.questionNumber === reviewQuestionNumber,
    );
    const previousQuestion = currentIndex > 0 ? examPayload.questions[currentIndex - 1] : null;
    const nextQuestion =
      currentIndex >= 0 && currentIndex < examPayload.questions.length - 1
        ? examPayload.questions[currentIndex + 1]
        : null;
    const resultState = getQuestionResultState(reviewQuestion, examSession.answers);
    const selectedAnswers = examSession.answers[reviewQuestion.questionNumber] ?? [];
    const selectedAnswerLabel = getAnswerLabels(reviewQuestion, selectedAnswers) || "未作答";
    const correctAnswerLabel = reviewQuestion.correctLabels.join("、") || "無";
    const mark = examSession.marks[reviewQuestion.questionNumber] ?? 0;

    return (
      <div className="review-workspace">
        <div className="review-workspace-header">
          <div className="review-workspace-toolbar">
            <button
              className="chrome-action-button secondary small"
              disabled={!previousQuestion}
              type="button"
              onClick={() => previousQuestion && setReviewQuestionNumber(previousQuestion.questionNumber)}
            >
              上一題
            </button>
            <label className="review-jump-control">
              <span>題號跳轉</span>
              <select
                className="review-nav-select"
                value={reviewQuestionNumber}
                onChange={(event) => setReviewQuestionNumber(Number(event.target.value))}
              >
                {examPayload.questions.map((question) => (
                  <option key={`review-jump-${question.id}`} value={question.questionNumber}>
                    第 {question.questionNumber} 題
                  </option>
                ))}
              </select>
            </label>
            <button
              className="chrome-action-button secondary small"
              disabled={!nextQuestion}
              type="button"
              onClick={() => nextQuestion && setReviewQuestionNumber(nextQuestion.questionNumber)}
            >
              下一題
            </button>
            <button
              className="chrome-action-button secondary small"
              type="button"
              onClick={() => setResultTab("record")}
            >
              回作答紀錄
            </button>
          </div>

          <div className="review-meta-strip">
            <div className="review-meta-cell">
              <span>目前題號</span>
              <strong>
                第 {reviewQuestion.questionNumber} 題 / 共 {examPayload.questions.length} 題
              </strong>
            </div>
            <div className={`review-meta-cell ${resultState}`}>
              <span>作答結果</span>
              <strong>{formatResultStateLabel(resultState)}</strong>
            </div>
            <div className="review-meta-cell">
              <span>你的答案</span>
              <strong>{selectedAnswerLabel}</strong>
            </div>
            <div className="review-meta-cell">
              <span>正確答案</span>
              <strong>{correctAnswerLabel}</strong>
            </div>
            <div className="review-meta-cell mark">
              <span>註記</span>
              <strong className="review-mark-display">
                {mark > 0 ? (
                  <>
                    <span aria-hidden="true" className={`mark-shape ${MARK_SHAPE_BY_VALUE[mark]}`} />
                    圖記 {mark}
                  </>
                ) : (
                  "無"
                )}
              </strong>
            </div>
          </div>
        </div>

        {renderResultReview(reviewQuestion)}
      </div>
    );
  }

  function renderPortalFrame(content: ReactNode, extraClassName?: string) {
    return (
      <div className={`portal-screen ${extraClassName ?? ""}`.trim()}>
        <div className="portal-banner" />
        <div className="portal-background">
          <div className="portal-card-wrap">{content}</div>
          <div className="portal-site-footer">
            中華民國考選部地址:台北市文山區試院路1-1號 總機:(02)22369188
            <br />
            2009 Ministry of Examination R.O.C . All rights reserved.
          </div>
        </div>
      </div>
    );
  }

  function renderExamTopPanel(options: {
    remainingTimeLabel: string;
    answered: number;
    unanswered: number;
    actions?: ReactNode;
  }) {
    if (!selectedExam || !candidate) {
      return null;
    }

    return (
      <section className="moex-top-panel">
        <div className="moex-top-panel-band" />
        <div className="moex-top-row first">
          <div className="moex-top-main-title">
            <span className="moex-label">考試名稱：</span>
            <strong>國家考試測驗式試題線上模擬作答</strong>
            <span className="moex-panel-subtitle">{selectedExam.displayTitle}</span>
          </div>
          {options.actions ? <div className="moex-top-actions">{options.actions}</div> : null}
        </div>
        <div className="moex-top-row">
          <div className="moex-meta-item">
            <span className="moex-label">類科：</span>
            <strong>{selectedExam.inferredStage || "各類科"}</strong>
          </div>
          <div className="moex-meta-item">
            <span className="moex-label">姓名：</span>
            <strong>{candidate.name}</strong>
          </div>
          <div className="moex-meta-item">
            <span className="moex-label">應試座位：</span>
            <strong>{candidate.seatNumber}</strong>
          </div>
        </div>
        <div className="moex-top-row subject">
          <div className="moex-meta-item wide">
            <span className="moex-label">科目：</span>
            <strong>{selectedExam.inferredSubject || "綜合科目"}</strong>
          </div>
        </div>
        <div className="moex-top-divider" />
        <div className="moex-stats-row">
          <div className="moex-stat-item">
            <span>座號：</span>
            <strong className="accent-red">{candidate.admissionTicket}</strong>
          </div>
          <div className="moex-stat-item">
            <span>題數：</span>
            <strong className="accent-red">{selectedExam.questionCount}</strong>
          </div>
          <div className="moex-stat-item">
            <span>已作答題數：</span>
            <strong className="accent-red">{options.answered}</strong>
          </div>
          <div className="moex-stat-item">
            <span>未作答題數：</span>
            <strong className="accent-red">{options.unanswered}</strong>
          </div>
          <div className="moex-stat-item time">
            <span>賸餘時間：</span>
            <strong className="accent-red">{options.remainingTimeLabel}</strong>
            <em>(含延長考試時間0分鐘)</em>
          </div>
        </div>
      </section>
    );
  }

  function renderHome() {
    return renderPortalFrame(
      <section className="portal-card selection-panel">
        <div className="portal-card-heading">
          <div>
            <h1>本地題庫選擇</h1>
            <p>以原站視覺重建的跨平台模擬測驗工具，使用預先整理好的 clean database。</p>
          </div>
          <div className="selection-stat-strip">
            <div>
              <strong>{initPayload?.examCount ?? "--"}</strong>
              <span>份試卷</span>
            </div>
            <div>
              <strong>{initPayload?.questionCount ?? "--"}</strong>
              <span>題資料</span>
            </div>
            <div>
              <strong>{formatPreparedAt(initPayload?.preparedAt ?? "0")}</strong>
              <span>整理完成</span>
            </div>
          </div>
        </div>

        <div className="selection-toolbar">
          <input
            className="selection-search"
            placeholder="搜尋年度、科別、題目、選項"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="selection-filter-row">
          <label className="selection-filter-group">
            <span>年分</span>
            <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
              <option value="">全部年分</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  民國 {year} 年
                </option>
              ))}
            </select>
          </label>

          <label className="selection-filter-group">
            <span>科目</span>
            <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
              {SUBJECT_FILTER_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="selection-filter-group">
            <span>次別</span>
            <select value={attemptFilter} onChange={(event) => setAttemptFilter(event.target.value)}>
              <option value="">全部次別</option>
              <option value="1">第一次</option>
              <option value="2">第二次</option>
            </select>
          </label>

          <button
            className="chrome-action-button secondary selection-filter-reset"
            type="button"
            onClick={() => {
              setYearFilter("");
              setSubjectFilter("");
              setAttemptFilter("");
            }}
          >
            清除篩選
          </button>
        </div>

        <div className="selection-note">
          本工具以原站流程重建，並保留本地作答結果與檢討功能。
          {normalizedSearch
            ? searchLoading
              ? " 目前正在搜尋題目與選項內容..."
              : ` 目前依搜尋條件顯示 ${visibleCatalog.length} 份試卷。`
            : ` 共顯示 ${visibleCatalog.length} 份試卷。`}
        </div>

        <div className="catalog-grid">
          {visibleCatalog.map((exam) => (
            <ExamCard exam={exam} key={exam.examId} onSelect={handleSelectExam} />
          ))}
        </div>
      </section>,
      "selection-screen",
    );
  }

  function renderLogin() {
    return renderPortalFrame(
      <section className="portal-card login-card">
        <div className="login-rule-block">
          <ol>
            <li>
              <span className="important">考試前三分鐘方可登入系統</span>，請靜候監場人員說明。
            </li>
            <li>請持身分證件於每節考試預備鈴聲響後，進入試場，依座號就座。</li>
            <li>
              就定位後，請仔細核對 <span className="important">試場之電腦座位標籤</span> 與
              <span className="important"> 考試通知書上之應試座位 </span>
              是否一致，如發現不符，應即向監場人員提出。
            </li>
            <li>請將身分證件放置於指定位置，俾利監場人員查驗。</li>
          </ol>
          <div className="exam-code-block">
            <div>試場代碼: (Moexir-109LUTY)</div>
            <div>(v1.0)</div>
          </div>
        </div>

        <div className="login-entry-strip">
          <label htmlFor="candidate-id">請輸入您的國民身分證統一編號:</label>
          <input
            className="moex-id-input"
            id="candidate-id"
            maxLength={10}
            value={candidateInput}
            onChange={(event) => setCandidateInput(sanitizeCandidateId(event.target.value))}
          />
          <button className="image-button send" type="button" onClick={handleCandidateContinue}>
            <span className="sr-only">送出</span>
          </button>
        </div>

        <LegacyKeyboard
          value={candidateInput}
          onChange={(value) => setCandidateInput(sanitizeCandidateId(value))}
        />

        <div className="login-bottom-row">
          <div className="login-summary">
            <div>
              <span>試卷</span>
              <strong>{selectedExam?.displayTitle}</strong>
            </div>
            <div>
              <span>科目</span>
              <strong>{selectedExam?.inferredSubject}</strong>
            </div>
            <div>
              <span>題數</span>
              <strong>{selectedExam?.questionCount ?? "--"} 題</strong>
            </div>
          </div>
          <button className="chrome-action-button secondary" type="button" onClick={resetToHome}>
            回選題
          </button>
        </div>
      </section>,
      "login-screen",
    );
  }

  function renderConfirm() {
    return renderPortalFrame(
      <section className="portal-card form-card">
        <div className="portal-section-title">考生資訊確認</div>
        <table className="legacy-table moex-info-table">
          <tbody>
            <tr>
              <th>應試科目</th>
              <td>{selectedExam?.displayTitle}</td>
              <th>姓名</th>
              <td>{candidate?.name}</td>
            </tr>
            <tr>
              <th>身分證號</th>
              <td>{candidate?.idNumber}</td>
              <th>應試座位</th>
              <td>{candidate?.seatNumber}</td>
            </tr>
            <tr>
              <th>座號</th>
              <td>{candidate?.admissionTicket}</td>
              <th>題數</th>
              <td>{selectedExam?.questionCount} 題</td>
            </tr>
          </tbody>
        </table>
        {savedSession && !savedSession.completed ? (
          <div className="resume-note">已找到未完成作答紀錄。進入考場後會直接續接上次進度。</div>
        ) : null}
        <div className="portal-card-actions">
          <button className="chrome-action-button secondary" type="button" onClick={() => setScreen("login")}>
            上一步
          </button>
          <button className="image-button ok" type="button" onClick={() => setScreen("scoreOptions")}>
            <span className="sr-only">確定</span>
          </button>
        </div>
      </section>,
      "confirm-screen",
    );
  }

  function renderScoreOptions() {
    return renderPortalFrame(
        <section className="portal-card form-card">
          <div className="portal-section-title">成績顯示設定</div>
          <table className="score-option-table">
            <tbody>
              <tr className="score-option-row-disabled">
                <td>是否於每節考試結束後，顯示該節成績?</td>
                <td>
                  <label className="inline-choice disabled">
                    是
                    <input
                      checked={false}
                      disabled
                      name="show-score"
                      type="radio"
                    />
                  </label>
                  <label className="inline-choice disabled">
                    否
                    <input
                      checked
                      disabled
                      name="show-score"
                      type="radio"
                    />
                  </label>
                </td>
              </tr>
              <tr>
              <td>當次考試結束後，顯示各科成績?</td>
              <td>
                <label className="inline-choice">
                  是
                  <input
                    checked={showAllScore}
                    name="show-all-score"
                    type="radio"
                    onChange={() => setShowAllScore(true)}
                  />
                </label>
                <label className="inline-choice">
                  否
                  <input
                    checked={!showAllScore}
                    name="show-all-score"
                    type="radio"
                    onChange={() => setShowAllScore(false)}
                  />
                </label>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="score-option-note">
          <span className="important">提醒您!</span>
          <br />
          *1.每節考試結束後的即時成績在本工具中不提供，故此列固定停用。
          <br />
          *2.若勾選「當次考試結束後，顯示各科成績」，交卷後會直接顯示成績與作答紀錄。
        </div>

        <div className="portal-card-actions">
          <button className="chrome-action-button secondary" type="button" onClick={() => setScreen("confirm")}>
            上一步
          </button>
          <button className="image-button ok" type="button" onClick={handleStartWaiting}>
            <span className="sr-only">確定</span>
          </button>
        </div>
      </section>,
      "score-screen",
    );
  }

  function renderWaiting() {
    return (
      <div className="exam-page-shell waiting-screen">
        {renderExamTopPanel({
          remainingTimeLabel: formatDuration(waitingSeconds),
          answered: 0,
          unanswered: totalQuestions || selectedExam?.questionCount || 0,
        })}
        <section className="practice-board">
          <div className="practice-button-row">
            <button className="image-button practice" type="button" onClick={() => setWaitingSeconds(0)}>
              <span className="sr-only">進入練習</span>
            </button>
          </div>
          <div className="shadow-divider" />
          <div className="practice-copy">
            <p>歡迎參加國家考試!</p>
            <p>一、考試開始前，應考人可進行「模擬作答練習」，或瀏覽「試場規則」，或「靜候考試開始」。</p>
            <p>二、考試開始時，系統將自動切換應考人電腦進入應試畫面。</p>
            <p>預祝您考試順利!金榜題名!</p>
          </div>
          <div className="shadow-divider alt" />
          <div className="practice-footer">
            <div className="practice-footer-copy">
              正式應試倒數中，剩餘 {waitingSeconds} 秒。若你只想快速進入作答頁，也可以直接按「進入練習」。
            </div>
            <div className="practice-footer-actions">
              <button className="chrome-action-button secondary" type="button" onClick={() => setScreen("scoreOptions")}>
                返回設定
              </button>
              <button className="image-button practice" type="button" onClick={() => setWaitingSeconds(0)}>
                <span className="sr-only">進入練習</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderExam() {
    if (!currentQuestion || !examSession || !selectedExam || !candidate) {
      return null;
    }

    return (
      <div className="exam-page-shell">
        {renderExamTopPanel({
          remainingTimeLabel: formatDuration(examSession.remainingSeconds),
          answered: answeredCount,
          unanswered: unansweredCount,
          actions: (
            <>
              <button className="chrome-action-button small" type="button" onClick={() => setScreen("browse")}>
                瀏覽作答情形
              </button>
              <button className="chrome-action-button small" type="button" onClick={() => setEndConfirmStep(1)}>
                結束作答
              </button>
            </>
          ),
        })}
        <section className="exam-main-board">
          <QuestionPanel
            answeredCount={answeredCount}
            mark={examSession.marks[currentQuestion.questionNumber] ?? 0}
            onCancelAnswer={handleCancelAnswer}
            onNextQuestion={() => stepQuestion(1)}
            onPreviousQuestion={() => stepQuestion(-1)}
            onQuestionJump={(questionNumber) => setCurrentQuestion(questionNumber)}
            onSelectAnswer={handleToggleAnswer}
            onSelectMark={handleSelectMark}
            onZoomChange={handleZoomChange}
            question={currentQuestion}
            remainingTimeLabel={formatDuration(examSession.remainingSeconds)}
            selectedAnswers={examSession.answers[currentQuestion.questionNumber] ?? []}
            totalQuestions={totalQuestions}
            unansweredCount={unansweredCount}
            zoom={examSession.zoom}
          />
        </section>
      </div>
    );
  }

  function renderBrowse() {
    if (!examPayload || !examSession || !selectedExam) {
      return null;
    }

    return (
      <div className="exam-page-shell browse-screen">
        {renderExamTopPanel({
          remainingTimeLabel: formatDuration(examSession.remainingSeconds),
          answered: answeredCount,
          unanswered: unansweredCount,
          actions: (
            <>
              <button className="chrome-action-button small" type="button" onClick={() => setScreen("exam")}>
                繼續作答
              </button>
              <button className="chrome-action-button small" type="button" onClick={() => setEndConfirmStep(1)}>
                結束作答
              </button>
            </>
          ),
        })}
        <section className="browse-board">
          <StatusGrid
            onSelectQuestion={(questionNumber) => {
              setCurrentQuestion(questionNumber);
              setScreen("exam");
            }}
            questions={examPayload.questions}
            session={examSession}
          />
          <div className="browse-footnote">
            注意事項: 1.上方顯示所有題目之題號及作答答案 2.若為
            <span className="important-inline">紅色</span>底色代表尚未作答 3.若試題題號旁有圖記代表試題更正
          </div>
        </section>
      </div>
    );
  }

  function renderResult() {
    if (!shouldShowResultScore) {
      return renderPortalFrame(
        <section className="portal-card result-card">
          <div className="portal-section-title">本節考試結束!</div>
          {timedOutSubmission ? <div className="timeout-note">時間到，系統已自動結束作答。</div> : null}
          <div className="noscore-box">
            <strong>你在前面的設定中選擇了不顯示各科成績與作答紀錄。</strong>
            <span>本次作答已完成，可返回登入頁或回選題。</span>
          </div>
          <div className="portal-card-actions">
            <button className="chrome-action-button secondary" type="button" onClick={resetToLogin}>
              立即返回登入頁
            </button>
            <button className="chrome-action-button" type="button" onClick={resetToHome}>
              回選題
            </button>
          </div>
        </section>,
        "result-screen",
      );
    }

    return renderPortalFrame(
      <section className="portal-card result-card study-result-card">
        <div className="portal-section-title">本節考試結束 / 作答結果</div>
        {timedOutSubmission ? <div className="timeout-note">時間到，系統已自動結束作答。</div> : null}
        {resultSummary ? (
          <>
            <div className="result-summary-grid">
              <div>
                <strong>{resultSummary.scorePercent}</strong>
                <span>總分</span>
              </div>
              <div>
                <strong>{resultSummary.correct}</strong>
                <span>答對</span>
              </div>
              <div>
                <strong>{resultSummary.incorrect}</strong>
                <span>答錯</span>
              </div>
              <div>
                <strong>{resultSummary.unanswered}</strong>
                <span>未作答</span>
              </div>
              <div>
                <strong>{resultSummary.answered}</strong>
                <span>已作答</span>
              </div>
              <div>
                <strong>{elapsedLabel}</strong>
                <span>作答時間</span>
              </div>
            </div>

            <div className="result-briefing">
              <span>{selectedExam?.displayTitle}</span>
              <span>考生：{candidate?.name}</span>
              <span>座位：{candidate?.seatNumber}</span>
              <span>
                本次共 {resultSummary.total} 題，得分 {resultSummary.scorePercent} 分，未作答 {resultSummary.unanswered} 題。
              </span>
            </div>
          </>
        ) : null}

        {shouldShowResultRecord ? (
          <>
            <div className="result-tab-strip">
              <button
                className={`result-tab-button ${resultTab === "summary" ? "active" : ""}`}
                type="button"
                onClick={() => setResultTab("summary")}
              >
                成績摘要
              </button>
              <button
                className={`result-tab-button ${resultTab === "record" ? "active" : ""}`}
                type="button"
                onClick={() => setResultTab("record")}
              >
                作答紀錄
              </button>
              <button
                className={`result-tab-button ${resultTab === "review" ? "active" : ""}`}
                type="button"
                onClick={() => setResultTab("review")}
              >
                題目檢討
              </button>
              <button
                className={`result-tab-button ${resultTab === "download" ? "active" : ""}`}
                type="button"
                onClick={() => setResultTab("download")}
              >
                下載
              </button>
            </div>

            {resultTab === "summary" ? (
              <div className="result-tab-panel">
                <div className="hint-text">
                  已依你的設定開啟成績與作答紀錄顯示。你可以切到「作答紀錄」查看全卷答案，或切到「題目檢討」逐題檢視。
                </div>
              </div>
            ) : null}

            {resultTab === "record" ? (
              <div className="result-tab-panel">{renderResultRecord()}</div>
            ) : null}

            {resultTab === "review" ? (
              <div className="result-tab-panel">{renderResultReviewWorkspace()}</div>
            ) : null}

            {resultTab === "download" ? (
              <div className="result-tab-panel">
                <Suspense fallback={<div className="download-help-text">載入下載工具中...</div>}>
                  {selectedExam && candidate && examPayload && examSession ? (
                    <AnswerSheetDownloadPanel
                      admissionTicket={candidate.admissionTicket}
                      answers={examSession.answers}
                      candidateId={candidate.idNumber}
                      candidateName={candidate.name}
                      elapsedLabel={elapsedLabel}
                      examSubtitle={`${selectedExam.inferredStage} | ${selectedExam.questionCount} 題`}
                      examTitle={`${selectedExam.displayTitle} 完整答案卷`}
                      generatedAtLabel={exportGeneratedAtLabel}
                      marks={examSession.marks}
                      questions={examPayload.questions}
                      resultSummary={resultSummary}
                      seatNumber={candidate.seatNumber}
                      onError={setErrorMessage}
                    />
                  ) : null}
                </Suspense>
              </div>
            ) : null}
          </>
        ) : (
          <div className="hint-text">你選擇只顯示成績摘要，因此本頁不展開作答紀錄與題目檢討。</div>
        )}
        <div className="portal-card-actions">
          <button className="chrome-action-button secondary" type="button" onClick={resetToLogin}>
            回登入頁
          </button>
          <button className="chrome-action-button" type="button" onClick={resetToHome}>
            回選題
          </button>
        </div>
      </section>,
      "result-screen",
    );
  }

  return (
    <div className={`app-shell screen-${screen}`}>
      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

      {screen === "home" ? renderHome() : null}
      {screen === "login" ? renderLogin() : null}
      {screen === "confirm" ? renderConfirm() : null}
      {screen === "scoreOptions" ? renderScoreOptions() : null}
      {screen === "waiting" ? renderWaiting() : null}
      {screen === "exam" ? renderExam() : null}
      {screen === "browse" ? renderBrowse() : null}
      {screen === "result" ? renderResult() : null}

      {busyMessage ? (
        <div className="busy-overlay">
          <div className="busy-card">
            <strong>{busyMessage}</strong>
            <span>桌面程式正在讀取預先整理好的 clean database。</span>
          </div>
        </div>
      ) : null}

      {endConfirmStep === 1 ? (
        <Modal
          title="是否結束本次應考？"
          actions={
            <>
              <button className="chrome-action-button secondary" type="button" onClick={() => setEndConfirmStep(0)}>
                取消
              </button>
              <button className="chrome-action-button" type="button" onClick={() => setEndConfirmStep(2)}>
                確認
              </button>
            </>
          }
        >
          系統將保留目前作答內容，並結束本次模擬測驗。
        </Modal>
      ) : null}

      {endConfirmStep === 2 ? (
        <Modal
          title="再次確認是否結束本次應考？"
          actions={
            <>
              <button className="chrome-action-button secondary" type="button" onClick={() => setEndConfirmStep(0)}>
                取消
              </button>
              <button className="chrome-action-button" type="button" onClick={() => completeExam(false)}>
                結束作答
              </button>
            </>
          }
        >
          這是最後一次確認。送出後會離開正式作答頁。
        </Modal>
      ) : null}
    </div>
  );
}

export default App;
