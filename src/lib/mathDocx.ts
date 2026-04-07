import type { MathComponent, ParagraphChild } from "docx";
import { getCachedMathMathMl } from "./mathContent";

type MathOptions = {
  children: readonly MathComponent[];
};

type BaseMathRuntime = {
  Math: new (options: MathOptions) => ParagraphChild;
  MathRun: new (text: string) => MathComponent;
  MathFraction: new (options: {
    numerator: readonly MathComponent[];
    denominator: readonly MathComponent[];
  }) => MathComponent;
  MathSuperScript: new (options: {
    children: readonly MathComponent[];
    superScript: readonly MathComponent[];
  }) => MathComponent;
  MathSubScript: new (options: {
    children: readonly MathComponent[];
    subScript: readonly MathComponent[];
  }) => MathComponent;
  MathSubSuperScript: new (options: {
    children: readonly MathComponent[];
    subScript: readonly MathComponent[];
    superScript: readonly MathComponent[];
  }) => MathComponent;
  MathRadical: new (options: {
    children: readonly MathComponent[];
    degree?: readonly MathComponent[];
  }) => MathComponent;
  MathFunction: new (options: {
    children: readonly MathComponent[];
    name: readonly MathComponent[];
  }) => MathComponent;
  MathRoundBrackets: new (options: MathOptions) => MathComponent;
  MathSquareBrackets: new (options: MathOptions) => MathComponent;
  MathCurlyBrackets: new (options: MathOptions) => MathComponent;
  MathAngledBrackets: new (options: MathOptions) => MathComponent;
  MathIntegral: new (options: {
    children: readonly MathComponent[];
    subScript?: readonly MathComponent[];
    superScript?: readonly MathComponent[];
  }) => MathComponent;
  MathSum: new (options: {
    children: readonly MathComponent[];
    subScript?: readonly MathComponent[];
    superScript?: readonly MathComponent[];
  }) => MathComponent;
};

const SUM_SYMBOLS = new Set(["∑"]);
const INTEGRAL_SYMBOLS = new Set(["∫", "∮", "∯", "∰", "∱", "∲", "∳"]);
const KNOWN_FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "ln",
  "log",
  "lim",
  "exp",
  "max",
  "min",
  "det",
  "Pr",
]);

function normalizeMathText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function textToMathRuns(value: string, docxMath: BaseMathRuntime) {
  const normalized = normalizeMathText(value);
  return normalized ? [new docxMath.MathRun(normalized)] : [];
}

function getElementChildren(element: Element) {
  return Array.from(element.children);
}

function getTagName(node: Element) {
  return node.localName.toLowerCase();
}

function convertNode(node: ChildNode, docxMath: BaseMathRuntime): MathComponent[] {
  if (node.nodeType === Node.TEXT_NODE) {
    return textToMathRuns(node.textContent ?? "", docxMath);
  }

  if (!(node instanceof Element)) {
    return [];
  }

  return convertElement(node, docxMath);
}

function convertChildren(parent: Element, docxMath: BaseMathRuntime): MathComponent[] {
  return Array.from(parent.childNodes).flatMap((node) => convertNode(node, docxMath));
}

function convertElementList(elements: Element[], docxMath: BaseMathRuntime): MathComponent[] {
  return elements.flatMap((element) => convertElement(element, docxMath));
}

function fallbackElementText(element: Element, docxMath: BaseMathRuntime) {
  return textToMathRuns(element.textContent ?? "", docxMath);
}

function wrapBracketedChildren(
  open: string,
  close: string,
  children: MathComponent[],
  docxMath: BaseMathRuntime,
) {
  const normalizedOpen = open || "";
  const normalizedClose = close || "";

  if (normalizedOpen === "(" && normalizedClose === ")") {
    return [new docxMath.MathRoundBrackets({ children })];
  }

  if (normalizedOpen === "[" && normalizedClose === "]") {
    return [new docxMath.MathSquareBrackets({ children })];
  }

  if (normalizedOpen === "{" && normalizedClose === "}") {
    return [new docxMath.MathCurlyBrackets({ children })];
  }

  if (
    (normalizedOpen === "<" || normalizedOpen === "⟨") &&
    (normalizedClose === ">" || normalizedClose === "⟩")
  ) {
    return [new docxMath.MathAngledBrackets({ children })];
  }

  return [
    ...textToMathRuns(normalizedOpen, docxMath),
    ...children,
    ...textToMathRuns(normalizedClose, docxMath),
  ];
}

function createNaryMath(
  symbol: string,
  lower: readonly MathComponent[] | undefined,
  upper: readonly MathComponent[] | undefined,
  docxMath: BaseMathRuntime,
) {
  if (SUM_SYMBOLS.has(symbol)) {
    return [
      new docxMath.MathSum({
        children: [],
        subScript: lower,
        superScript: upper,
      }),
    ];
  }

  if (INTEGRAL_SYMBOLS.has(symbol)) {
    return [
      new docxMath.MathIntegral({
        children: [],
        subScript: lower,
        superScript: upper,
      }),
    ];
  }

  return null;
}

function convertElement(element: Element, docxMath: BaseMathRuntime): MathComponent[] {
  const tagName = getTagName(element);
  const childElements = getElementChildren(element);

  switch (tagName) {
    case "math":
    case "mrow":
    case "mstyle":
    case "mpadded":
    case "mphantom":
      return convertChildren(element, docxMath);
    case "semantics":
      return convertElementList(
        childElements.filter((child) => getTagName(child) !== "annotation"),
        docxMath,
      );
    case "annotation":
      return [];
    case "mi":
    case "mn":
    case "mo":
    case "mtext":
    case "ms":
      return fallbackElementText(element, docxMath);
    case "mspace":
      return [new docxMath.MathRun(" ")];
    case "mfrac": {
      const [numerator, denominator] = childElements;
      if (!numerator || !denominator) {
        return fallbackElementText(element, docxMath);
      }

      return [
        new docxMath.MathFraction({
          numerator: convertElement(numerator, docxMath),
          denominator: convertElement(denominator, docxMath),
        }),
      ];
    }
    case "msup": {
      const [base, superScript] = childElements;
      if (!base || !superScript) {
        return fallbackElementText(element, docxMath);
      }

      return [
        new docxMath.MathSuperScript({
          children: convertElement(base, docxMath),
          superScript: convertElement(superScript, docxMath),
        }),
      ];
    }
    case "msub": {
      const [base, subScript] = childElements;
      if (!base || !subScript) {
        return fallbackElementText(element, docxMath);
      }

      return [
        new docxMath.MathSubScript({
          children: convertElement(base, docxMath),
          subScript: convertElement(subScript, docxMath),
        }),
      ];
    }
    case "msubsup": {
      const [base, subScript, superScript] = childElements;
      if (!base || !subScript || !superScript) {
        return fallbackElementText(element, docxMath);
      }

      return [
        new docxMath.MathSubSuperScript({
          children: convertElement(base, docxMath),
          subScript: convertElement(subScript, docxMath),
          superScript: convertElement(superScript, docxMath),
        }),
      ];
    }
    case "msqrt":
      return [
        new docxMath.MathRadical({
          children: convertChildren(element, docxMath),
        }),
      ];
    case "mroot": {
      const [radicand, degree] = childElements;
      if (!radicand) {
        return fallbackElementText(element, docxMath);
      }

      return [
        new docxMath.MathRadical({
          children: convertElement(radicand, docxMath),
          degree: degree ? convertElement(degree, docxMath) : undefined,
        }),
      ];
    }
    case "mfenced": {
      const open = element.getAttribute("open") ?? "(";
      const close = element.getAttribute("close") ?? ")";
      const children = convertChildren(element, docxMath);
      return wrapBracketedChildren(open, close, children, docxMath);
    }
    case "munder":
    case "mover":
    case "munderover": {
      const [base, lower, upper] = childElements;
      if (!base) {
        return fallbackElementText(element, docxMath);
      }

      const symbol = normalizeMathText(base.textContent ?? "");
      const lowerComponents = lower ? convertElement(lower, docxMath) : undefined;
      const upperComponents =
        tagName === "mover" ? (lower ? convertElement(lower, docxMath) : undefined) : upper
          ? convertElement(upper, docxMath)
          : undefined;

      const nary = createNaryMath(
        symbol,
        tagName === "mover" ? undefined : lowerComponents,
        upperComponents,
        docxMath,
      );
      if (nary) {
        return nary;
      }

      if (tagName === "mover" && lower) {
        return [
          new docxMath.MathSuperScript({
            children: convertElement(base, docxMath),
            superScript: convertElement(lower, docxMath),
          }),
        ];
      }

      if (tagName === "munder" && lower) {
        return [
          new docxMath.MathSubScript({
            children: convertElement(base, docxMath),
            subScript: convertElement(lower, docxMath),
          }),
        ];
      }

      if (lower && upper) {
        return [
          new docxMath.MathSubSuperScript({
            children: convertElement(base, docxMath),
            subScript: convertElement(lower, docxMath),
            superScript: convertElement(upper, docxMath),
          }),
        ];
      }

      return fallbackElementText(element, docxMath);
    }
    case "mtd":
    case "mtr":
    case "mtable":
      return convertChildren(element, docxMath);
    default: {
      const normalizedText = normalizeMathText(element.textContent ?? "");
      if (KNOWN_FUNCTIONS.has(normalizedText)) {
        return [
          new docxMath.MathFunction({
            name: [new docxMath.MathRun(normalizedText)],
            children: [],
          }),
        ];
      }

      return fallbackElementText(element, docxMath);
    }
  }
}

export function buildDocxMathChild(
  source: string,
  displayMode: boolean,
  docxMath: BaseMathRuntime,
): ParagraphChild | null {
  const mathMlMarkup = getCachedMathMathMl(source, displayMode);
  if (!mathMlMarkup || typeof DOMParser === "undefined") {
    return null;
  }

  const parser = new DOMParser();
  const parsedDocument = parser.parseFromString(mathMlMarkup, "text/html");
  const mathElement = parsedDocument.querySelector("math");
  if (!mathElement) {
    return null;
  }

  const children = convertElement(mathElement, docxMath);
  if (children.length === 0) {
    return null;
  }

  return new docxMath.Math({ children });
}
