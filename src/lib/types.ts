export type AppScreen =
  | "home"
  | "login"
  | "confirm"
  | "scoreOptions"
  | "waiting"
  | "exam"
  | "browse"
  | "result";

export type QuestionMark = 0 | 1 | 2 | 3;

export interface InitializationPayload {
  examCount: number;
  questionCount: number;
  preparedAt: string;
}

export interface BootstrapPayload {
  initialization: InitializationPayload;
  exams: ExamCatalogItem[];
}

export interface ExamCatalogItem {
  examId: string;
  examYear: number | null;
  rocYear: number | null;
  examNthTime: number | null;
  questionCount: number;
  imageCount: number;
  inferredSubject: string;
  inferredStage: string;
  displayTitle: string;
  subtitle: string;
  tags: string[];
}

export interface ChoiceOption {
  label: string;
  text: string;
}

export interface QuestionRecord {
  id: string;
  examId: string;
  questionNumber: number;
  questionText: string;
  options: ChoiceOption[];
  correctAnswerIndices: number[];
  correctLabels: string[];
  questionImages: string[];
  tags: string[];
  isMultipleChoice: boolean;
}

export interface ExamPayload {
  exam: ExamCatalogItem;
  questions: QuestionRecord[];
}

export interface ExamSession {
  currentQuestion: number;
  remainingSeconds: number;
  zoom: number;
  answers: Record<number, number[]>;
  marks: Record<number, QuestionMark>;
  completed: boolean;
  startedAt: string;
  endedAt?: string;
}

export interface ResultSummary {
  total: number;
  answered: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  scorePercent: number;
}
