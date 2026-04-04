import type { ExamSession, QuestionRecord } from "../lib/types";

const MARK_SHAPE_BY_VALUE: Record<number, string> = {
  1: "triangle",
  2: "circle",
  3: "square",
};

interface StatusGridProps {
  questions: QuestionRecord[];
  session: ExamSession;
  onSelectQuestion: (questionNumber: number) => void;
}

export function StatusGrid({ questions, session, onSelectQuestion }: StatusGridProps) {
  const questionGroups: QuestionRecord[][] = [];

  for (let index = 0; index < questions.length; index += 10) {
    questionGroups.push(questions.slice(index, index + 10));
  }

  return (
    <div className="status-grid">
      <table className="status-table">
        <tbody>
          {questionGroups.map((group) => (
            <tr key={`group-${group[0]?.questionNumber ?? "empty"}`}>
              <td className="status-table-block">
                <table className="status-table-inner">
                  <tbody>
                    <tr className="status-number-row">
                      <th>題號</th>
                      {group.map((question) => {
                        const isCurrent = question.questionNumber === session.currentQuestion;
                        const mark = session.marks[question.questionNumber] ?? 0;

                        return (
                          <td className={isCurrent ? "current" : ""} key={`number-${question.id}`}>
                            <button
                              className="status-question-link"
                              type="button"
                              onClick={() => onSelectQuestion(question.questionNumber)}
                            >
                              <span>[{question.questionNumber}]</span>
                              {mark > 0 ? (
                                <span
                                  aria-hidden="true"
                                  className={`mark-shape status-mark-shape ${MARK_SHAPE_BY_VALUE[mark]}`}
                                />
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="status-answer-row">
                      <th>答案</th>
                      {group.map((question) => {
                        const selectedAnswers = session.answers[question.questionNumber] ?? [];
                        const answerLabel = selectedAnswers
                          .map((index) => question.options[index]?.label)
                          .filter((label): label is string => Boolean(label))
                          .join("");
                        const mark = session.marks[question.questionNumber] ?? 0;
                        const isCurrent = question.questionNumber === session.currentQuestion;

                        return (
                          <td
                            className={[
                              selectedAnswers.length > 0 ? "answered" : "blank",
                              mark > 0 ? "marked" : "",
                              isCurrent ? "current" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={`answer-${question.id}`}
                          >
                            <button
                              className="status-answer-link"
                              type="button"
                              onClick={() => onSelectQuestion(question.questionNumber)}
                            >
                              {answerLabel}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
