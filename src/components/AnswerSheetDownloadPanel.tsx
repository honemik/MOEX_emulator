import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useMemo, useRef, useState } from "react";
import { buildAnswerSheetDocument } from "../lib/answerSheet";
import { normalizeInvokeError } from "../lib/api";
import {
  buildAnswerSheetFileName,
  buildAnswerSheetDocx,
  printAnswerSheetPdf,
} from "../lib/exportAnswerSheet";
import type { QuestionMark, QuestionRecord, ResultSummary } from "../lib/types";
import { AnswerSheetExportView } from "./AnswerSheetExportView";

interface AnswerSheetDownloadPanelProps {
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
  onError: (message: string | null) => void;
}

export default function AnswerSheetDownloadPanel({
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
  onError,
}: AnswerSheetDownloadPanelProps) {
  const exportSheetRef = useRef<HTMLDivElement | null>(null);
  const [includeCorrectAnswers, setIncludeCorrectAnswers] = useState(true);
  const [includeUserAnswers, setIncludeUserAnswers] = useState(true);
  const [exportingFormat, setExportingFormat] = useState<"pdf" | "docx" | null>(null);

  const answerSheet = useMemo(
    () =>
      buildAnswerSheetDocument({
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
      }),
    [
      admissionTicket,
      answers,
      candidateId,
      candidateName,
      elapsedLabel,
      examSubtitle,
      examTitle,
      generatedAtLabel,
      includeCorrectAnswers,
      includeUserAnswers,
      marks,
      questions,
      resultSummary,
      seatNumber,
    ],
  );

  async function handleDownload(format: "pdf" | "docx") {
    if (!exportSheetRef.current) {
      return;
    }

    onError(null);
    setExportingFormat(format);

    try {
      if (format === "pdf") {
        await printAnswerSheetPdf(exportSheetRef.current, answerSheet.title);
        return;
      }

      const fileName = buildAnswerSheetFileName(answerSheet.title, "docx");
      const savePath = await save({
        defaultPath: fileName,
        filters: [
          {
            name: "Word 文件",
            extensions: ["docx"],
          },
        ],
      });

      if (!savePath) {
        return;
      }

      const bytes = await buildAnswerSheetDocx(answerSheet);
      await writeFile(savePath, bytes);
    } catch (error) {
      onError(`下載${format === "pdf" ? " PDF" : " Word"}失敗：${normalizeInvokeError(error)}`);
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <div className="download-panel">
      <div className="download-panel-controls">
        <div className="download-option-group">
          <label className="download-toggle">
            <input
              checked={includeCorrectAnswers}
              type="checkbox"
              onChange={(event) => setIncludeCorrectAnswers(event.target.checked)}
            />
            <span>顯示正確答案</span>
          </label>
          <label className="download-toggle">
            <input
              checked={includeUserAnswers}
              type="checkbox"
              onChange={(event) => setIncludeUserAnswers(event.target.checked)}
            />
            <span>顯示自己的作答答案</span>
          </label>
        </div>

        <div className="download-action-group">
          <button
            className="chrome-action-button"
            disabled={exportingFormat !== null}
            type="button"
            onClick={() => handleDownload("pdf")}
          >
            {exportingFormat === "pdf" ? "開啟 PDF 列印中..." : "下載 PDF"}
          </button>
          <button
            className="chrome-action-button secondary"
            disabled={exportingFormat !== null}
            type="button"
            onClick={() => handleDownload("docx")}
          >
            {exportingFormat === "docx" ? "產出 Word 中..." : "下載 Word"}
          </button>
        </div>
      </div>

      <div className="download-help-text">
        PDF 會開啟系統列印視窗，直接另存成可複製文字的 PDF；Word 會跳出存檔位置選擇。兩種格式都會依你目前的開關設定決定是否顯示正確答案與你的作答答案。
      </div>

      <div className="download-preview-note">
        目前設定：
        {includeCorrectAnswers ? " 顯示正確答案" : " 不顯示正確答案"} /
        {includeUserAnswers ? " 顯示自己的作答答案" : " 不顯示自己的作答答案"}
      </div>

      <div className="download-preview-container" ref={exportSheetRef}>
        <AnswerSheetExportView document={answerSheet} />
      </div>
    </div>
  );
}
