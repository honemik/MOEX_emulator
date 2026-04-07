import type { ParagraphChild } from "docx";
import type { AnswerSheetDocument } from "./answerSheet";
import { resolveImageAssetUrl } from "./api";
import { buildDocxMathChild } from "./mathDocx";
import { parseMathSegments } from "./mathContent";

function sanitizeFileNameSegment(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim();
}

export function buildAnswerSheetFileName(title: string, extension: "pdf" | "docx") {
  const base = sanitizeFileNameSegment(title) || "moex-answer-sheet";
  return `${base}-答案卷.${extension}`;
}

async function waitForExportAssets(container: HTMLElement) {
  if ("fonts" in document) {
    await (document as Document & { fonts: FontFaceSet }).fonts.ready;
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const images = Array.from(container.querySelectorAll("img"));
    const allLoaded =
      images.length > 0
        ? images.every((image) => image.complete && image.naturalWidth > 0)
        : !container.textContent?.includes("圖片載入中...");

    if (allLoaded) {
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
}

async function waitForDocumentAssets(targetDocument: Document) {
  if ("fonts" in targetDocument) {
    await (targetDocument as Document & { fonts: FontFaceSet }).fonts.ready;
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const images = Array.from(targetDocument.images);
    const allLoaded =
      images.length > 0
        ? images.every((image) => image.complete && image.naturalWidth > 0)
        : !targetDocument.body.textContent?.includes("圖片載入中...");

    if (allLoaded) {
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function collectPrintableStyleMarkup() {
  return Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
    .map((node) => {
      if (node instanceof HTMLStyleElement) {
        return node.outerHTML;
      }

      if (node instanceof HTMLLinkElement && node.href) {
        return `<link rel="stylesheet" href="${escapeHtmlAttribute(node.href)}">`;
      }

      return "";
    })
    .join("\n");
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("無法將圖片轉為 data URL"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("圖片讀取失敗"));
    reader.readAsDataURL(blob);
  });
}

const blobCache = new Map<string, Promise<Blob>>();
const dataUrlCache = new Map<string, Promise<string>>();
const imageRenderCache = new Map<
  string,
  Promise<{ bytes: Uint8Array; width: number; height: number; type: "png" | "jpg" }>
>();

async function fetchBlobFromUrl(url: string) {
  if (!blobCache.has(url)) {
    blobCache.set(
      url,
      fetch(url).then((response) => {
        if (!response.ok) {
          throw new Error(`無法讀取圖片資源：${url}`);
        }

        return response.blob();
      }),
    );
  }

  return blobCache.get(url)!;
}

async function fetchDataUrlFromUrl(url: string) {
  if (!dataUrlCache.has(url)) {
    dataUrlCache.set(
      url,
      fetchBlobFromUrl(url).then((blob) => blobToDataUrl(blob)),
    );
  }

  return dataUrlCache.get(url)!;
}

async function loadImageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || 800,
        height: image.naturalHeight || 600,
      });
    };
    image.onerror = () => reject(new Error(`無法讀取圖片尺寸：${url}`));
    image.src = url;
  });
}

async function resolveQuestionImage(relativePath: string) {
  if (!imageRenderCache.has(relativePath)) {
    imageRenderCache.set(
      relativePath,
      (async () => {
        const url = await resolveImageAssetUrl(relativePath);
        const [blob, dimensions] = await Promise.all([
          fetchBlobFromUrl(url),
          loadImageDimensions(url),
        ]);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const maxWidth = 480;
        const width = Math.min(maxWidth, dimensions.width);
        const height = Math.max(1, Math.round((dimensions.height / dimensions.width) * width));
        const normalizedSource = relativePath.split("?")[0].toLowerCase();
        const type: "png" | "jpg" = normalizedSource.endsWith(".png") ? "png" : "jpg";

        return { bytes, width, height, type };
      })(),
    );
  }

  return imageRenderCache.get(relativePath)!;
}

async function resolveQuestionImageDataUrl(relativePath: string) {
  const url = await resolveImageAssetUrl(relativePath);
  return fetchDataUrlFromUrl(url);
}

async function inlinePrintableImages(sourceRoot: HTMLElement, targetRoot: HTMLElement) {
  const sourceImages = Array.from(sourceRoot.querySelectorAll<HTMLImageElement>("img"));
  const targetImages = Array.from(targetRoot.querySelectorAll<HTMLImageElement>("img"));

  await Promise.all(
    targetImages.map(async (targetImage, index) => {
      const sourceImage = sourceImages[index];
      if (!sourceImage?.src) {
        return;
      }

      targetImage.loading = "eager";
      targetImage.decoding = "sync";

      try {
        const relativePath = sourceImage.dataset.relativePath;
        targetImage.src = relativePath
          ? await resolveQuestionImageDataUrl(relativePath)
          : await fetchDataUrlFromUrl(sourceImage.currentSrc || sourceImage.src);
      } catch {
        targetImage.src = sourceImage.currentSrc || sourceImage.src;
      }
    }),
  );
}

export async function printAnswerSheetPdf(container: HTMLElement, documentTitle: string) {
  await waitForExportAssets(container);

  const printableRoot = container.firstElementChild;
  if (!(printableRoot instanceof HTMLElement)) {
    throw new Error("找不到可列印的答案卷內容");
  }

  const printableClone = printableRoot.cloneNode(true) as HTMLElement;
  await inlinePrintableImages(printableRoot, printableClone);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "1200px";
  iframe.style.height = "800px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const frameDocument = iframe.contentDocument;
  const frameWindow = iframe.contentWindow;
  if (!frameDocument || !frameWindow) {
    iframe.remove();
    throw new Error("無法建立 PDF 列印頁面");
  }

  const title = escapeHtmlAttribute(documentTitle);
  const baseHref = escapeHtmlAttribute(document.baseURI);
  const printableStyles = collectPrintableStyleMarkup();

  frameDocument.open();
  frameDocument.write(`<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <base href="${baseHref}">
    <title>${title}</title>
    ${printableStyles}
    <style>
      @page {
        size: A4;
        margin: 8mm 9mm;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #000000;
      }

      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .export-answer-sheet {
        width: auto !important;
        padding: 0 !important;
      }

      .export-sheet-section,
      .export-option-row,
      .download-preview-container,
      .export-question-image {
        border: 0 !important;
        box-shadow: none !important;
      }

      .export-sheet-section,
      .export-question-card {
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
    </style>
  </head>
  <body>${printableClone.outerHTML}</body>
</html>`);
  frameDocument.close();

  await waitForDocumentAssets(frameDocument);
  await new Promise((resolve) => window.setTimeout(resolve, 150));

  await new Promise<void>((resolve) => {
    let finished = false;
    const printStartedAt = Date.now();
    let fallbackId = 0;

    const cleanup = () => {
      if (finished) {
        return;
      }
      finished = true;
      frameWindow.removeEventListener("afterprint", handleAfterPrint);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (fallbackId) {
        window.clearTimeout(fallbackId);
      }
      iframe.remove();
      resolve();
    };

    const scheduleCleanup = () => {
      window.setTimeout(cleanup, 250);
    };

    const handleAfterPrint = () => {
      scheduleCleanup();
    };

    const handleFocus = () => {
      if (Date.now() - printStartedAt < 750) {
        return;
      }
      scheduleCleanup();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && Date.now() - printStartedAt >= 750) {
        scheduleCleanup();
      }
    };

    frameWindow.addEventListener("afterprint", handleAfterPrint);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    fallbackId = window.setTimeout(cleanup, 120000);
    frameWindow.focus();
    frameWindow.print();
  });
}

function getOptionLabelColor(state: string) {
  if (state === "correct") {
    return "2e7d32";
  }

  if (state === "wrong") {
    return "c62828";
  }

  return "000000";
}

export async function buildAnswerSheetDocx(document: AnswerSheetDocument) {
  const {
    AlignmentType,
    Document,
    ImageRun,
    Math,
    MathFraction,
    MathFunction,
    MathIntegral,
    MathRadical,
    MathRoundBrackets,
    MathRun,
    MathSquareBrackets,
    MathCurlyBrackets,
    MathAngledBrackets,
    MathSubScript,
    MathSubSuperScript,
    MathSum,
    MathSuperScript,
    Packer,
    Paragraph,
    TextRun,
  } = await import("docx");

  const BODY_TEXT_SIZE = 24;
  const TITLE_TEXT_SIZE = 32;

  const children: InstanceType<typeof Paragraph>[] = [];

  async function buildRichTextRuns(
    text: string,
    options: {
      size: number;
      color: string;
      bold?: boolean;
    },
  ): Promise<ParagraphChild[]> {
    const runs: ParagraphChild[] = [];

    function pushPlainText(value: string) {
      const normalized = value.replace(/\r\n/g, "\n");
      const lines = normalized.split("\n");

      lines.forEach((line, index) => {
        if (index > 0) {
          runs.push(
            new TextRun({
              text: "",
              break: 1,
              size: options.size,
              color: options.color,
              bold: options.bold,
            }),
          );
        }

        if (line.length > 0) {
          runs.push(
            new TextRun({
              text: line,
              size: options.size,
              color: options.color,
              bold: options.bold,
            }),
          );
        }
      });
    }

    for (const segment of parseMathSegments(text)) {
      if (segment.type === "text") {
        pushPlainText(segment.value);
        continue;
      }

      const mathChild = buildDocxMathChild(segment.value, segment.displayMode, {
        Math,
        MathAngledBrackets,
        MathCurlyBrackets,
        MathFraction,
        MathFunction,
        MathIntegral,
        MathRadical,
        MathRoundBrackets,
        MathRun,
        MathSquareBrackets,
        MathSubScript,
        MathSubSuperScript,
        MathSum,
        MathSuperScript,
      });

      if (!mathChild) {
        pushPlainText(segment.raw);
        continue;
      }

      if (segment.displayMode && runs.length > 0) {
        runs.push(
          new TextRun({
            text: "",
            break: 1,
            size: options.size,
            color: options.color,
            bold: options.bold,
          }),
        );
      }

      runs.push(mathChild);

      if (segment.displayMode) {
        runs.push(
          new TextRun({
            text: "",
            break: 1,
            size: options.size,
            color: options.color,
            bold: options.bold,
          }),
        );
      }
    }

    if (runs.length === 0) {
      runs.push(
        new TextRun({
          text: "",
          size: options.size,
          color: options.color,
          bold: options.bold,
        }),
      );
    }

    return runs;
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 140 },
      children: [new TextRun({ text: document.title, bold: true, size: TITLE_TEXT_SIZE, color: "000000" })],
    }),
  );

  if (document.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 220 },
        children: [new TextRun({ text: document.subtitle, size: BODY_TEXT_SIZE, color: "000000" })],
      }),
    );
  }

  for (const line of document.metaLines) {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: line, size: BODY_TEXT_SIZE, color: "000000" })],
      }),
    );
  }

  if (document.summaryLines.length > 0) {
    for (const line of document.summaryLines) {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: line, size: BODY_TEXT_SIZE, color: "000000" })],
        }),
      );
    }
    children.push(new Paragraph({ spacing: { after: 140 } }));
  } else {
    children.push(new Paragraph({ spacing: { after: 220 } }));
  }

  for (const question of document.questions) {
    children.push(
      new Paragraph({
        spacing: { before: 180, after: 140 },
        children: await buildRichTextRuns(question.text, {
          size: BODY_TEXT_SIZE,
          color: "000000",
        }),
      }),
    );

    for (const imagePath of question.questionImages) {
      const { bytes, width, height, type } = await resolveQuestionImage(imagePath);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
          children: [new ImageRun({ data: bytes, transformation: { width, height }, type })],
        }),
      );
    }

    for (const option of question.options) {
      const optionTextRuns = await buildRichTextRuns(option.text, {
        size: BODY_TEXT_SIZE,
        color: "000000",
      });

      children.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: `(${option.label}) `,
              bold: true,
              color: getOptionLabelColor(option.state),
              size: BODY_TEXT_SIZE,
            }),
            ...optionTextRuns,
          ],
        }),
      );
    }

    children.push(new Paragraph({ spacing: { after: 160 } }));
  }

  const wordDocument = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return new Uint8Array(await (await Packer.toBlob(wordDocument)).arrayBuffer());
}
