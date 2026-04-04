import { Fragment, memo, useMemo } from "react";
import { renderToString } from "katex";

interface MathTextProps {
  text: string;
  className?: string;
  as?: "div" | "span";
}

type TextSegment = {
  type: "text";
  value: string;
};

type MathSegment = {
  type: "math";
  value: string;
  raw: string;
  displayMode: boolean;
};

type Segment = TextSegment | (MathSegment & { markup: string | null });

const mathMarkupCache = new Map<string, string | null>();

function isEscaped(source: string, index: number) {
  let slashCount = 0;
  let cursor = index - 1;

  while (cursor >= 0 && source[cursor] === "\\") {
    slashCount += 1;
    cursor -= 1;
  }

  return slashCount % 2 === 1;
}

function parseMathSegments(source: string): Array<TextSegment | MathSegment> {
  const segments: Array<TextSegment | MathSegment> = [];
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

function renderMathMarkup(source: string, displayMode: boolean) {
  try {
    return renderToString(source, {
      displayMode,
      throwOnError: false,
      output: "html",
      strict: "ignore",
      trust: false,
    });
  } catch {
    return null;
  }
}

function getCachedMathMarkup(source: string, displayMode: boolean) {
  const cacheKey = `${displayMode ? "display" : "inline"}:${source}`;
  if (mathMarkupCache.has(cacheKey)) {
    return mathMarkupCache.get(cacheKey) ?? null;
  }

  const markup = renderMathMarkup(source, displayMode);
  mathMarkupCache.set(cacheKey, markup);
  return markup;
}

export const MathText = memo(function MathText({ text, className, as = "div" }: MathTextProps) {
  const Tag = as;
  const segments = useMemo(
    () =>
      parseMathSegments(text).map((segment) =>
        segment.type === "text"
          ? segment
          : {
              ...segment,
              markup: getCachedMathMarkup(segment.value, segment.displayMode),
            },
      ),
    [text],
  );

  return (
    <Tag className={["math-text", className].filter(Boolean).join(" ")}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <Fragment key={`text-${index}`}>{segment.value}</Fragment>;
        }

        if (!segment.markup) {
          return <Fragment key={`fallback-${index}`}>{segment.raw}</Fragment>;
        }

        return (
          <span
            className={`math-expression ${segment.displayMode ? "block" : "inline"}`}
            dangerouslySetInnerHTML={{ __html: segment.markup }}
            key={`math-${index}`}
          />
        );
      })}
    </Tag>
  );
});

MathText.displayName = "MathText";
