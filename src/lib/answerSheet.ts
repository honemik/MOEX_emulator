import {
  getAnswerOptionState,
  type AnswerOptionState,
  normalizeSelectedAnswers,
} from "./examResults";
import type { QuestionMark, QuestionRecord, ResultSummary } from "./types";

export interface AnswerSheetOption {
  label: string;
  text: string;
  state: AnswerOptionState;
}

export interface AnswerSheetQuestion {
  questionNumber: number;
  text: string;
  questionImages: string[];
  options: AnswerSheetOption[];
}

export interface AnswerSheetDocument {
  title: string;
  subtitle: string;
  metaLines: string[];
  summaryLines: string[];
  questions: AnswerSheetQuestion[];
}

const MARK_SYMBOL_BY_VALUE: Record<QuestionMark, string> = {
  0: "",
  1: "▲",
  2: "●",
  3: "■",
};

interface BuildAnswerSheetDocumentArgs {
  examTitle: string;
  examSubtitle: string;
  candidateName: string;
  candidateId: string;
  seatNumber: string;
  admissionTicket: string;
  elapsedLabel: string;
  generatedAtLabel: string;
  resultSummary: ResultSummary | null;
  questions: QuestionRecord[];
  answers: Record<number, number[]>;
  marks: Record<number, QuestionMark>;
  includeCorrectAnswers: boolean;
  includeUserAnswers: boolean;
}

export function buildAnswerSheetDocument({
  examTitle,
  examSubtitle,
  candidateName,
  candidateId,
  seatNumber,
  admissionTicket,
  elapsedLabel,
  generatedAtLabel,
  resultSummary,
  questions,
  answers,
  marks,
  includeCorrectAnswers,
  includeUserAnswers,
}: BuildAnswerSheetDocumentArgs): AnswerSheetDocument {
  return {
    title: examTitle,
    subtitle: examSubtitle,
    metaLines: [
      `考生：${candidateName}`,
      `身分證號：${candidateId}`,
      `應試座位：${seatNumber}`,
      `座號：${admissionTicket}`,
      `作答時間：${elapsedLabel}`,
      `匯出時間：${generatedAtLabel}`,
    ],
    summaryLines: resultSummary
      ? [
          `總分：${resultSummary.scorePercent}`,
          `答對：${resultSummary.correct}`,
          `答錯：${resultSummary.incorrect}`,
          `未作答：${resultSummary.unanswered}`,
          `已作答：${resultSummary.answered}`,
          `總題數：${resultSummary.total}`,
        ]
      : [],
    questions: questions.map((question) => {
      const selectedAnswers = normalizeSelectedAnswers(question, answers[question.questionNumber] ?? []);
      const mark = marks[question.questionNumber] ?? 0;
      const markSymbol = MARK_SYMBOL_BY_VALUE[mark];
      const prefix = markSymbol
        ? `${question.questionNumber}. ${markSymbol} `
        : `${question.questionNumber}. `;

      return {
        questionNumber: question.questionNumber,
        text: `${prefix}${question.questionText}`,
        questionImages: question.questionImages,
        options: question.options.map((option, index) => ({
          label: option.label,
          text: option.text,
          state: getAnswerOptionState({
            isSelected: selectedAnswers.includes(index),
            isCorrect: question.correctAnswerIndices.includes(index),
            includeCorrectAnswers,
            includeUserAnswers,
          }),
        })),
      };
    }),
  };
}
