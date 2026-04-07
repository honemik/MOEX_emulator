import { renderToString } from "katex";

export interface TextSegment {
  type: "text";
  value: string;
}

export interface MathSegment {
  type: "math";
  value: string;
  raw: string;
  displayMode: boolean;
}

export type ParsedMathSegment = TextSegment | MathSegment;

export type RenderedMathSegment = TextSegment | (MathSegment & { markup: string | null });

const htmlMarkupCache = new Map<string, string | null>();
const mathMlCache = new Map<string, string | null>();

function isEscaped(source: string, index: number) {
  let slashCount = 0;
  let cursor = index - 1;

  while (cursor >= 0 && source[cursor] === "\\") {
    slashCount += 1;
    cursor -= 1;
  }

  return slashCount % 2 === 1;
}

export function parseMathSegments(source: string): ParsedMathSegment[] {
  const segments: ParsedMathSegment[] = [];
  let textStart = 0;
  let cursor = 0;

  while (cursor < source.length) {
    if (source[cursor] !== "$" || isEscaped(source, cursor)) {
      cursor += 1;
      continue;
    }

    const displayMode = source[cursor + 1] === "$";
    const delimiterLength = displayMode ? 2 : 1;
    const mathStart = cursor + delimiterLength;
    let mathEnd = mathStart;
    let closingIndex = -1;

    while (mathEnd < source.length) {
      if (source[mathEnd] !== "$" || isEscaped(source, mathEnd)) {
        mathEnd += 1;
        continue;
      }

      if (displayMode) {
        if (source[mathEnd + 1] === "$" && !isEscaped(source, mathEnd + 1)) {
          closingIndex = mathEnd;
          break;
        }
      } else {
        closingIndex = mathEnd;
        break;
      }

      mathEnd += 1;
    }

    if (closingIndex === -1) {
      cursor += 1;
      continue;
    }

    if (textStart < cursor) {
      segments.push({
        type: "text",
        value: source.slice(textStart, cursor),
      });
    }

    segments.push({
      type: "math",
      value: source.slice(mathStart, closingIndex),
      raw: source.slice(cursor, closingIndex + delimiterLength),
      displayMode,
    });

    cursor = closingIndex + delimiterLength;
    textStart = cursor;
  }

  if (textStart < source.length) {
    segments.push({
      type: "text",
      value: source.slice(textStart),
    });
  }

  return segments;
}

function renderMathString(
  source: string,
  displayMode: boolean,
  output: "html" | "mathml",
) {
  try {
    return renderToString(source, {
      displayMode,
      throwOnError: false,
      output,
      strict: "ignore",
      trust: false,
    });
  } catch {
    return null;
  }
}

function getCachedRender(
  cache: Map<string, string | null>,
  source: string,
  displayMode: boolean,
  output: "html" | "mathml",
) {
  const cacheKey = `${output}:${displayMode ? "display" : "inline"}:${source}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  const markup = renderMathString(source, displayMode, output);
  cache.set(cacheKey, markup);
  return markup;
}

export function getCachedMathMarkup(source: string, displayMode: boolean) {
  return getCachedRender(htmlMarkupCache, source, displayMode, "html");
}

export function getCachedMathMathMl(source: string, displayMode: boolean) {
  return getCachedRender(mathMlCache, source, displayMode, "mathml");
}

export function buildRenderedMathSegments(source: string): RenderedMathSegment[] {
  return parseMathSegments(source).map((segment) =>
    segment.type === "text"
      ? segment
      : {
          ...segment,
          markup: getCachedMathMarkup(segment.value, segment.displayMode),
        },
  );
}
