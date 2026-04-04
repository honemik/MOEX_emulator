import type { ExamCatalogItem } from "../lib/types";

interface ExamCardProps {
  exam: ExamCatalogItem;
  onSelect: (exam: ExamCatalogItem) => void;
}

export function ExamCard({ exam, onSelect }: ExamCardProps) {
  return (
    <button className="exam-card" type="button" onClick={() => onSelect(exam)}>
      <div className="exam-card-head">
        <span className="exam-card-stage">{exam.inferredStage}</span>
        <span className="exam-card-mode">MOEX 重建</span>
      </div>
      <div className="exam-card-main">
        <h3>{exam.displayTitle}</h3>
        <p>{exam.subtitle}</p>
      </div>
      <div className="exam-card-meta">
        <span>{exam.questionCount} 題</span>
        <span>{exam.imageCount} 張圖</span>
        <span>{exam.tags.slice(0, 4).join(" / ") || "未分類"}</span>
      </div>
    </button>
  );
}
