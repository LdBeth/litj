import type { DirectKind, NumKind, Token } from "./ast.ts";

/**
 * J Language Lexer
 *
 * J number literals support:
 * - Infinity: _ or __
 * - Negative: leading underscore _3
 * - Complex: 2j3 (real j imaginary)
 * - Extended precision: 123x
 * - Power notation: 2p3 (2 × 10^3), 2r3 (2 × 3), 2x3 (2 × 3)
 * - Radian: 1.5ar3 (angle-radius), 45ad2 (angle-distance)
 * - Radix: 2b1010 (binary), 16b1a2f (hex)
 *
 * Implementation uses parser combinators with equational reasoning
 * for correctness and simplicity. See individual functions for derivations.
 */

// ── Primitive classification tables ─────────────────────────────────────────

const ADVERBS = new Set([
  "~",
  "/",
  "\\",
  "/.",
  "\\.",
  "}",
  "b.",
  "f.",
  "M.",
]);

const CONJUNCTIONS = new Set([
  "^:",
  "@:",
  "@.",
  "&:",
  "&.",
  "&",
  "@",
  "!:",
  '":',
  "`:",
  "S:",
  "L:",
  "H.",
  "T.",
  "D:",
  "d.",
  ";.",
  "`",
  "!.",
]);

const GRAPHICS = new Set('=<>+*-%$~|,;#!/\\[]`@&?^"'.split(""));

const CONTROL_WORDS = new Set([
  "assert.",
  "break.",
  "continue.",
  "else.",
  "elseif.",
  "end.",
  "fcase.",
  "for.",
  "for_.",
  "if.",
  "do.",
  "goto_.",
  "label_.",
  "return.",
  "select.",
  "case.",
  "throw.",
  "try.",
  "catch.",
  "catchd.",
  "catcht.",
  "while.",
  "whilst.",
]);

// ── Character classification ────────────────────────────────────────────────

function isAlpha(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isGraphic(c: string): boolean {
  return GRAPHICS.has(c) || c === "{" || c === "}";
}

// ── Parser combinators for number lexing ────────────────────────────────────

/** Scan while predicate holds, return end position */
function scanWhile(
  src: string,
  pos: number,
  pred: (c: string) => boolean,
): number {
  let p = pos;
  while (p < src.length && pred(src[p])) p++;
  return p;
}

/** Check if character at pos matches, advance if so */
function tryChar(src: string, pos: number, c: string): number {
  return pos < src.length && src[pos] === c ? pos + 1 : pos;
}

/** Check if character at pos satisfies predicate */
function peekChar(
  src: string,
  pos: number,
  pred: (c: string) => boolean,
): boolean {
  return pos < src.length && pred(src[pos]);
}

/** Lex digits with optional leading underscore. Returns null if no digits found. */
function lexDigits(src: string, pos: number): number | null {
  const p = tryChar(src, pos, "_");
  const end = scanWhile(src, p, isDigit);
  // Special case: bare _ or __ (infinity)
  if (end === p) {
    if (p === pos + 1 && src[pos] === "_") {
      return tryChar(src, p, "_"); // __ or _
    }
    return null;
  }
  return end;
}

/** Check if next char is a valid number terminator */
function isNumTerminator(src: string, pos: number): boolean {
  if (pos >= src.length) return true;
  const c = src[pos];
  return c === " " || c === ")" || c === "\n" || c === "\r" ||
    isGraphic(c) || c === "'" || "jrpxba".includes(c);
}

// ── Simplified number lexing ────────────────────────────────────────────────

/**
 * Lex uptofloat: _? digits (. digits?)? (e _? digits)?
 *
 * Derivation:
 *   lexUptofloat = optional('_') >> digits >> optional(decimal) >> optional(exponent)
 * where
 *   decimal = '.' >> optional(digits)  -- when followed by valid terminator
 *   exponent = 'e' >> optional('_') >> digits
 */
function lexUptofloat(src: string, pos: number): number | null {
  let p = pos;

  // Required digits (or bare _ / __ for infinity)
  // lexDigits handles optional leading underscore internally
  const afterDigits = lexDigits(src, p);
  if (afterDigits === null) return null;
  p = afterDigits;

  // Optional decimal point + digits
  if (peekChar(src, p, (c) => c === ".")) {
    const next = p + 1 < src.length ? src[p + 1] : "";
    // Decimal is valid if followed by digit, 'e', or terminator
    if (isDigit(next) || next === "e" || isNumTerminator(src, p + 1)) {
      p++;
      p = scanWhile(src, p, isDigit);
    }
  }

  // Optional exponent
  if (peekChar(src, p, (c) => c === "e")) {
    p++;
    p = tryChar(src, p, "_");
    const expEnd = scanWhile(src, p, isDigit);
    if (expEnd === p) return null; // 'e' without digits is invalid
    p = expEnd;
  }

  return p;
}

/**
 * Lex uptocomplex: uptofloat (j uptofloat)?
 *
 * Derivation:
 *   lexUptocomplex = lexUptofloat >>= \p ->
 *                    optional('j' >> lexUptofloat) >>= \q ->
 *                    pure (p or q)
 * Simplified: try complex extension, fallback to float position
 */
function lexUptocomplex(src: string, pos: number): number | null {
  const floatEnd = lexUptofloat(src, pos);
  if (floatEnd === null) return null;

  // Try complex extension: j uptofloat
  if (peekChar(src, floatEnd, (c) => c === "j")) {
    const complexEnd = lexUptofloat(src, floatEnd + 1);
    if (complexEnd !== null) return complexEnd;
  }

  return floatEnd;
}

/** Helper: lex radix suffix 'b' followed by alphanumeric */
function lexRadix(src: string, pos: number): number | null {
  if (!peekChar(src, pos, (c) => c === "b")) return null;
  const end = scanWhile(
    src,
    pos + 1,
    (c) => isDigit(c) || (c >= "a" && c <= "z"),
  );
  return end > pos + 1 ? end : null;
}

/**
 * Lex suffix extensions: power (r/p/x), radian (ar/ad), radix (b...)
 *
 * Derivation:
 *   lexSuffix pos = tryPower pos <|> tryRadian pos <|> tryRadix pos <|> pure pos
 * where each try returns extended position or null.
 */
function lexSuffix(
  src: string,
  pos: number,
): { nk: NumKind; end: number } | null {
  // Power: r, p, x
  if (peekChar(src, pos, (c) => "rpx".includes(c))) {
    const rest = lexUptocomplex(src, pos + 1);
    if (rest !== null) {
      // Check for radix after power
      const radix = lexRadix(src, rest);
      if (radix !== null) return { nk: "radix", end: radix };
      return { nk: "power", end: rest };
    }
  }

  // Radian: ar, ad
  if (
    pos + 1 < src.length && src[pos] === "a" &&
    (src[pos + 1] === "r" || src[pos + 1] === "d")
  ) {
    const rest = lexUptofloat(src, pos + 2);
    if (rest !== null) {
      const radix = lexRadix(src, rest);
      if (radix !== null) return { nk: "radix", end: radix };
      return { nk: "radian", end: rest };
    }
  }

  // Radix: b followed by alphanumeric
  const radix = lexRadix(src, pos);
  if (radix !== null) return { nk: "radix", end: radix };

  return null;
}

/**
 * Lex a complete number atom.
 *
 * Grammar:
 *   number = uptofloat ('x' | 'j' uptofloat | suffix)?
 *
 * Where:
 *   - 'x' extension is only valid after pure integers
 *   - 'j' introduces complex numbers
 *   - suffix handles power/radian/radix notations
 */
function lexNumberAtom(
  src: string,
  pos: number,
): { nk: NumKind; end: number } | null {
  // First, try to parse as uptofloat
  const uptoFloatEnd = lexUptofloat(src, pos);
  if (uptoFloatEnd === null) return null;

  // Determine if we parsed a pure integer (no decimal or exponent)
  // Bare _ and __ are floats (infinity)
  const text = src.slice(pos, uptoFloatEnd);
  const isPureInteger = !text.includes(".") && !text.includes("e") &&
    text !== "_" && text !== "__";

  // Check for 'x' (extended) — only after pure integer
  if (
    isPureInteger &&
    peekChar(src, uptoFloatEnd, (c) => c === "x") &&
    !peekChar(src, uptoFloatEnd + 1, isAlpha)
  ) {
    return { nk: "extend", end: uptoFloatEnd + 1 };
  }

  const baseKind: NumKind = isPureInteger ? "integer" : "float";

  // Complex: j uptofloat
  if (peekChar(src, uptoFloatEnd, (c) => c === "j")) {
    const complexEnd = lexUptofloat(src, uptoFloatEnd + 1);
    if (complexEnd !== null) {
      // Check for suffix after complex
      const suffix = lexSuffix(src, complexEnd);
      if (suffix) return suffix;
      return { nk: "complex", end: complexEnd };
    }
  }

  // Check for power/radian/radix suffixes
  const suffix = lexSuffix(src, uptoFloatEnd);
  if (suffix) return suffix;

  return { nk: baseKind, end: uptoFloatEnd };
}

// ── Main tokenizer ──────────────────────────────────────────────────────────

/**
 * Tokenize a J expression.
 *
 * Uses longest-match lexing: each iteration tries token types in order
 * until one matches, then continues from the new position.
 *
 * Token types (in priority order):
 * - Whitespace (skipped)
 * - Comments (NB. stops tokenization)
 * - String literals (single quotes, '' escapes)
 * - Direct definitions ({{ ... }})
 * - Parentheses
 * - Copula (=: =.)
 * - Numbers (see lexNumberAtom for grammar)
 * - Names/keywords (alphanumeric with optional locale suffix)
 * - Graphic primitives (operators, up to 3 chars)
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const c = source[i];

    // Whitespace
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }

    // Comment — stop tokenizing
    if (
      source.startsWith("NB.", i) &&
      (i + 3 >= len || !isAlpha(source[i + 3]))
    ) {
      break;
    }

    // String literal
    if (c === "'") {
      i++;
      let value = "";
      let closed = false;
      while (i < len) {
        if (source[i] === "'") {
          if (i + 1 < len && source[i + 1] === "'") {
            value += "'";
            i += 2;
          } else {
            i++;
            closed = true;
            break;
          }
        } else {
          value += source[i];
          i++;
        }
      }
      if (closed) {
        tokens.push({ kind: "string", pos: "noun", text: value });
      } else {
        tokens.push({ kind: "error", message: "open quote" });
      }
      continue;
    }

    // Direct definition {{ ... }}
    if (c === "{" && i + 1 < len && source[i + 1] === "{") {
      i += 2;
      let defKind: DirectKind | null = null;

      // Check for )kind marker
      if (i < len && source[i] === ")") {
        i++;
        if (i < len && "mdvacn*".includes(source[i])) {
          defKind = source[i] as DirectKind;
          i++;
        } else {
          tokens.push({
            kind: "error",
            message: "invalid direct definition kind",
          });
          // Skip to matching }} or end
          let depth = 1;
          while (i < len && depth > 0) {
            if (source[i] === "{" && i + 1 < len && source[i + 1] === "{") {
              depth++;
              i += 2;
            } else if (
              source[i] === "}" && i + 1 < len && source[i + 1] === "}"
            ) {
              depth--;
              i += 2;
            } else {
              i++;
            }
          }
          continue;
        }
      }

      if (defKind === "n") {
        // Noun: body is raw string until }}
        const bodyStart = i;
        while (i < len) {
          if (source[i] === "}" && i + 1 < len && source[i + 1] === "}") break;
          i++;
        }
        if (i >= len) {
          tokens.push({
            kind: "error",
            message: "unclosed direct definition",
          });
          continue;
        }
        tokens.push({
          kind: "direct_noun",
          pos: "noun",
          body: source.slice(bodyStart, i),
        });
        i += 2;
      } else {
        // Non-noun: require colon after kind marker
        if (defKind !== null) {
          // Skip whitespace before colon
          while (
            i < len && (source[i] === " " || source[i] === "\t")
          ) i++;
          if (i >= len || source[i] !== ":") {
            tokens.push({
              kind: "error",
              message: "expected ':' after direct definition kind",
            });
            // Skip to matching }} or end
            let depth = 1;
            while (i < len && depth > 0) {
              if (
                source[i] === "{" && i + 1 < len && source[i + 1] === "{"
              ) {
                depth++;
                i += 2;
              } else if (
                source[i] === "}" && i + 1 < len && source[i + 1] === "}"
              ) {
                depth--;
                i += 2;
              } else {
                i++;
              }
            }
            continue;
          }
          i++; // skip ':'
        }

        // Find matching }} with nesting
        const bodyStart = i;
        let depth = 1;
        let p = i;
        while (p < len && depth > 0) {
          if (source[p] === "{" && p + 1 < len && source[p + 1] === "{") {
            depth++;
            p += 2;
          } else if (
            source[p] === "}" && p + 1 < len && source[p + 1] === "}"
          ) {
            depth--;
            if (depth === 0) break;
            p += 2;
          } else {
            p++;
          }
        }

        if (depth > 0) {
          tokens.push({
            kind: "error",
            message: "unclosed direct definition",
          });
          i = len;
          continue;
        }

        const bodyText = source.slice(bodyStart, p);
        const body = tokenize(bodyText);
        tokens.push({ kind: "direct", pos: "mark", defKind, body });
        i = p + 2;
      }
      continue;
    }

    // Parentheses
    if (c === "(") {
      tokens.push({ kind: "lpar", pos: "lpar" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ kind: "rpar", pos: "rpar" });
      i++;
      continue;
    }

    // Copula
    if (
      c === "=" && i + 1 < len &&
      (source[i + 1] === ":" || source[i + 1] === ".")
    ) {
      tokens.push({
        kind: "copula",
        pos: "copula",
        text: source.slice(i, i + 2),
      });
      i += 2;
      continue;
    }

    // Digit-colon verbs (0: through 9:)
    if (isDigit(c) && i + 1 < len && source[i + 1] === ":") {
      tokens.push({
        kind: "prim",
        pos: "verb",
        text: source.slice(i, i + 2),
      });
      i += 2;
      continue;
    }

    // Number
    if (
      isDigit(c) || (c === "_" && (i + 1 >= len || isDigit(source[i + 1]) ||
        source[i + 1] === "_" || source[i + 1] === "."))
    ) {
      const atom = lexNumberAtom(source, i);
      if (atom) {
        tokens.push({
          kind: "number",
          pos: "noun",
          nk: atom.nk,
          text: source.slice(i, atom.end),
        });
        i = atom.end;
        continue;
      }
    }

    // Name / keyword / primitive with dot/colon
    if (isAlpha(c)) {
      let j = i + 1;
      while (
        j < len &&
        (isAlpha(source[j]) || isDigit(source[j]) || source[j] === "_")
      ) {
        j++;
      }

      // Check for trailing dot or colon
      if (j < len && (source[j] === "." || source[j] === ":")) {
        const word = source.slice(i, j + 1);

        // NB. comment
        if (source.slice(i, j) === "NB" && source[j] === ".") {
          break;
        }

        // Single letter + dot/colon = primitive
        if (j - i === 1) {
          const pos = ADVERBS.has(word)
            ? "adv" as const
            : CONJUNCTIONS.has(word)
            ? "conj" as const
            : "verb" as const;
          tokens.push({ kind: "prim", pos, text: word });
          i = j + 1;
          continue;
        }

        // Multi-letter + dot = control word or keyword
        if (CONTROL_WORDS.has(word) || (source[i] >= "a" && source[i] <= "z")) {
          tokens.push({ kind: "keyword", pos: "mark", text: word });
          i = j + 1;
          continue;
        }
      }

      // Name with optional locale suffix
      let nameEnd = j;
      if (nameEnd < len && source[nameEnd] === "_") {
        if (nameEnd + 1 < len && source[nameEnd + 1] === "_") {
          // __locale
          nameEnd += 2;
          nameEnd = scanWhile(source, nameEnd, (c) => isAlpha(c) || isDigit(c));
        } else {
          // _locale_
          nameEnd++;
          nameEnd = scanWhile(source, nameEnd, (c) => isAlpha(c) || isDigit(c));
          if (nameEnd < len && source[nameEnd] === "_") nameEnd++;
        }
      }

      tokens.push({
        kind: "name",
        pos: "name",
        text: source.slice(i, nameEnd),
      });
      i = nameEnd;
      continue;
    }

    // Graphic primitives
    if (isGraphic(c) || c === "{" || c === "}") {
      // Try longest match (up to 3 chars)
      let best = "";
      let bestLen = 0;

      for (let tryLen = 3; tryLen >= 1; tryLen--) {
        if (i + tryLen > len) continue;
        const candidate = source.slice(i, i + tryLen);

        if (
          tryLen === 3 && candidate === "{::"
        ) {
          best = candidate;
          bestLen = tryLen;
          break;
        }

        if (tryLen === 2) {
          const c2 = candidate[1];
          if (c2 === "." || c2 === ":" || (c === "`" && c2 === ":")) {
            best = candidate;
            bestLen = tryLen;
            break;
          }
        }

        if (tryLen === 1) {
          best = candidate;
          bestLen = tryLen;
          break;
        }
      }

      if (bestLen > 0) {
        const pos = ADVERBS.has(best)
          ? "adv" as const
          : CONJUNCTIONS.has(best)
          ? "conj" as const
          : "verb" as const;
        tokens.push({ kind: "prim", pos, text: best });
        i += bestLen;
        continue;
      }
    }

    // Standalone . and : are conjunctions (when preceded by whitespace)
    if (c === "." || c === ":") {
      tokens.push({ kind: "prim", pos: "conj", text: c });
      i++;
      continue;
    }

    // Skip unknown
    i++;
  }

  return tokens;
}
