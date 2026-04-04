import type { QuestionMark, QuestionRecord } from "../lib/types";
import { ImageAsset } from "./ImageAsset";
import { MathText } from "./MathText";

const MARK_LABELS: Array<{
  value: QuestionMark;
  assistiveLabel: string;
  visibleLabel?: string;
  shapeClass: string;
}> = [
  { value: 1, assistiveLabel: "輔助註記一", shapeClass: "triangle" },
  { value: 2, assistiveLabel: "輔助註記二", shapeClass: "circle" },
  { value: 3, assistiveLabel: "輔助註記三", shapeClass: "square" },
  { value: 0, assistiveLabel: "不註記", visibleLabel: "不註記", shapeClass: "ring" },
];

interface QuestionPanelProps {
  question: QuestionRecord;
  selectedAnswers: number[];
  mark: QuestionMark;
  zoom: number;
  totalQuestions: number;
  answeredCount: number;
  unansweredCount: number;
  remainingTimeLabel: string;
  onSelectAnswer: (answerIndex: number) => void;
  onSelectMark: (mark: QuestionMark) => void;
  onQuestionJump: (questionNumber: number) => void;
  onZoomChange: (zoom: number) => void;
  onCancelAnswer: () => void;
  onPreviousQuestion: () => void;
  onNextQuestion: () => void;
}

export function QuestionPanel({
  question,
  selectedAnswers,
  mark,
  zoom,
  totalQuestions,
  answeredCount,
  unansweredCount,
  remainingTimeLabel,
  onSelectAnswer,
  onSelectMark,
  onQuestionJump,
  onZoomChange,
  onCancelAnswer,
  onPreviousQuestion,
  onNextQuestion,
}: QuestionPanelProps) {
  const scorePerQuestion = totalQuestions > 0 ? (100 / totalQuestions).toFixed(2) : "1.00";

  return (
    <div className="moex-question-layout">
      <div className="exam-command-strip">
        <div className="command-button-cluster">
          <button className="chrome-action-button" type="button" onClick={onPreviousQuestion}>
            上一題
          </button>
          <button className="chrome-action-button" type="button" onClick={onNextQuestion}>
            下一題
          </button>
          <button className="chrome-action-button" type="button" onClick={onCancelAnswer}>
            取消作答
          </button>
        </div>

        <div className="mark-panel">
          <span className="mark-panel-title">輔助作答註記</span>
          <div className="mark-option-row">
            {MARK_LABELS.map((item) => (
              <label
                className={`mark-token ${mark === item.value ? "active" : ""}`}
                key={item.value}
                title={item.assistiveLabel}
              >
                <input
                  checked={mark === item.value}
                  name="mark"
                  type="radio"
                  onChange={() => onSelectMark(item.value)}
                />
                <span aria-hidden="true" className="mark-radio-indicator" />
                <span aria-hidden="true" className={`mark-shape ${item.shapeClass}`} />
                {item.visibleLabel ? <span className="mark-text">{item.visibleLabel}</span> : null}
                <span className="sr-only">{item.assistiveLabel}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="question-position">
          <span>目前在第</span>
          <select
            value={question.questionNumber}
            onChange={(event) => onQuestionJump(Number(event.target.value))}
          >
            {Array.from({ length: totalQuestions }, (_, index) => index + 1).map((number) => (
              <option key={number} value={number}>
                {number}
              </option>
            ))}
          </select>
          <span>題</span>
        </div>
      </div>

      <div className="question-heading-strip">
        <strong className="question-sequence">
          第 <span className="question-sequence-number">{question.questionNumber}</span> 題
        </strong>
        <span className="question-score">({scorePerQuestion}分)</span>
        <button
          className="zoom-link enlarge"
          type="button"
          onClick={() => onZoomChange(Math.min(150, zoom + 10))}
        >
          放大
        </button>
        <button className="zoom-link reset" type="button" onClick={() => onZoomChange(100)}>
          還原
        </button>
        <button
          className="zoom-link shrink"
          type="button"
          onClick={() => onZoomChange(Math.max(100, zoom - 10))}
        >
          縮小
        </button>
        <span className="zoom-state">(顯示比例:{zoom}%)</span>
      </div>

      <div className="question-shell" style={{ fontSize: `${zoom}%` }}>
        <MathText className="question-text" text={question.questionText} />

        {question.questionImages.length > 0 ? (
          <div className="image-stack">
            {question.questionImages.map((imagePath, index) => (
              <ImageAsset
                alt={`題目圖片 ${index + 1}`}
                className="question-image"
                key={`${question.id}-${imagePath}`}
                relativePath={imagePath}
              />
            ))}
          </div>
        ) : null}

        <div className="choice-list moex-choice-list">
          {question.options.map((option, index) => {
            const checked = selectedAnswers.includes(index);

            return (
              <label
                className={`choice-row moex-choice-row ${checked ? "selected" : ""}`}
                key={`${question.id}-${option.label}`}
              >
                <input
                  checked={checked}
                  name={`question-${question.questionNumber}`}
                  type={question.isMultipleChoice ? "checkbox" : "radio"}
                  onChange={() => onSelectAnswer(index)}
                />
                <span className="choice-label">({option.label})</span>
                <MathText as="span" className="choice-text" text={option.text} />
              </label>
            );
          })}
        </div>
      </div>

      <div className="exam-command-strip bottom">
        <div className="command-button-cluster">
          <button className="chrome-action-button" type="button" onClick={onPreviousQuestion}>
            上一題
          </button>
          <button className="chrome-action-button" type="button" onClick={onNextQuestion}>
            下一題
          </button>
          <button className="chrome-action-button" type="button" onClick={onCancelAnswer}>
            取消作答
          </button>
        </div>
        <div className="question-summary-strip">
          <span>已作答題數：{answeredCount}</span>
          <span>未作答題數：{unansweredCount}</span>
          <span>賸餘時間：{remainingTimeLabel}</span>
        </div>
      </div>
    </div>
  );
}
