import { Fragment, memo, useMemo } from "react";
import { buildRenderedMathSegments } from "../lib/mathContent";

interface MathTextProps {
  text: string;
  className?: string;
  as?: "div" | "span";
}

export const MathText = memo(function MathText({ text, className, as = "div" }: MathTextProps) {
  const Tag = as;
  const segments = useMemo(() => buildRenderedMathSegments(text), [text]);

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
