import type { QuestionRecord } from "./types";

export type QuestionResultState = "correct" | "wrong" | "blank";
export type AnswerOptionState = "neutral" | "correct" | "wrong";

export function sameAnswers(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

export function normalizeSelectedAnswers(question: QuestionRecord, selected: number[]) {
  const uniqueSorted = [...new Set(selected)].sort((left, right) => left - right);
  if (question.isMultipleChoice || uniqueSorted.length <= 1) {
    return uniqueSorted;
  }

  const acceptedAnswer = uniqueSorted.find((index) => question.correctAnswerIndices.includes(index));
  return [acceptedAnswer ?? uniqueSorted[uniqueSorted.length - 1]];
}

export function isQuestionCorrect(question: QuestionRecord, answers: Record<number, number[]>) {
  const selectedAnswers = normalizeSelectedAnswers(question, answers[question.questionNumber] ?? []);
  if (selectedAnswers.length === 0) {
    return false;
  }

  if (question.isMultipleChoice) {
    return sameAnswers(question.correctAnswerIndices, selectedAnswers);
  }

  return selectedAnswers.some((index) => question.correctAnswerIndices.includes(index));
}

export function getAnswerLabels(question: QuestionRecord, selected: number[]) {
  return selected
    .map((index) => question.options[index]?.label)
    .filter((label): label is string => Boolean(label))
    .join("、");
}

export function getQuestionResultState(
  question: QuestionRecord,
  answers: Record<number, number[]>,
): QuestionResultState {
  const selectedAnswers = answers[question.questionNumber] ?? [];

  if (selectedAnswers.length === 0) {
    return "blank";
  }

  return isQuestionCorrect(question, answers) ? "correct" : "wrong";
}

export function formatResultStateLabel(state: QuestionResultState) {
  if (state === "correct") {
    return "答對";
  }

  if (state === "wrong") {
    return "答錯";
  }

  return "未作答";
}

export function getAnswerOptionState(args: {
  isSelected: boolean;
  isCorrect: boolean;
  includeCorrectAnswers: boolean;
  includeUserAnswers: boolean;
}): AnswerOptionState {
  const { isSelected, isCorrect, includeCorrectAnswers, includeUserAnswers } = args;

  if ((includeCorrectAnswers && isCorrect) || (includeUserAnswers && isSelected && isCorrect)) {
    return "correct";
  }

  if (includeUserAnswers && isSelected && !isCorrect) {
    return "wrong";
  }

  return "neutral";
}
