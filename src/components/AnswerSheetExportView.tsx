import type { AnswerSheetDocument } from "../lib/answerSheet";
import { ImageAsset } from "./ImageAsset";
import { MathText } from "./MathText";

interface AnswerSheetExportViewProps {
  document: AnswerSheetDocument;
}

export function AnswerSheetExportView({ document }: AnswerSheetExportViewProps) {
  return (
    <div className="export-answer-sheet" data-export-root="answer-sheet">
      <section className="export-sheet-section export-sheet-header" data-export-section="header">
        <div className="export-sheet-title-block">
          <h1>{document.title}</h1>
          <p>{document.subtitle}</p>
        </div>

        <div className="export-sheet-meta">
          {document.metaLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>

        {document.summaryLines.length > 0 ? (
          <div className="export-sheet-summary">
            {document.summaryLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        ) : null}
      </section>

      {document.questions.map((question) => (
        <section
          className="export-sheet-section export-question-card"
          data-export-section="question"
          data-question-number={question.questionNumber}
          key={`export-question-${question.questionNumber}`}
        >
          <MathText className="export-question-text" text={question.text} />

          {question.questionImages.length > 0 ? (
            <div className="export-image-stack">
              {question.questionImages.map((imagePath, index) => (
                <ImageAsset
                  alt={`題目 ${question.questionNumber} 圖片 ${index + 1}`}
                  className="export-question-image"
                  key={`${question.questionNumber}-export-image-${imagePath}`}
                  relativePath={imagePath}
                />
              ))}
            </div>
          ) : null}

          <div className="export-option-list">
            {question.options.map((option) => (
              <div
                className="export-option-row"
                data-export-option={option.label}
                key={`${question.questionNumber}-${option.label}`}
              >
                <div className="export-option-body">
                  <span
                    className={`export-option-label ${option.state}`}
                    data-option-label-state={option.state}
                  >
                    ({option.label})
                  </span>
                  <MathText as="span" className="export-option-text" text={option.text} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
