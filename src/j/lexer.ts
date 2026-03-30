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

const GRAPHICS = new Set('=<>+*-%$~|,;#!/\\[]`@&?^"{}'.split(""));

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
  return GRAPHICS.has(c);
}

/** Classify a primitive token by part of speech */
function classifyPrim(text: string): "verb" | "adv" | "conj" {
  return ADVERBS.has(text) ? "adv" : CONJUNCTIONS.has(text) ? "conj" : "verb";
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

/** Lex digits with optional leading underscore. Returns null if no digits found. */
function lexDigits(src: string, pos: number): number | null {
  const p = tryChar(src, pos, "_");
  const end = scanWhile(src, p, isDigit);
  if (end === p) {
    // bare _ or __ (infinity)
    if (p === pos + 1 && src[pos] === "_") {
      return tryChar(src, p, "_");
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

// ── Number lexing ───────────────────────────────────────────────────────────

/**
 * Lex uptofloat: _? digits (. digits?)? (e _? digits)?
 *
 * Returns { end, isInt } where isInt indicates no decimal point, exponent,
 * or bare infinity was parsed — i.e., the result is a pure integer.
 *
 * Derivation (compute-once principle):
 *   The caller (lexNumberAtom) previously re-scanned the parsed text to check
 *   for '.' and 'e'. Since lexUptofloat already branches on these characters,
 *   we carry the flag through instead of re-deriving it:
 *     slice(pos, end) >>= \text -> not (includes "." text || includes "e" text)
 *   = { lexUptofloat already branches on '.' and 'e' }
 *     carry isInt flag, set false when entering decimal/exponent branches
 */
function lexUptofloat(
  src: string,
  pos: number,
): { end: number; isInt: boolean } | null {
  const afterDigits = lexDigits(src, pos);
  if (afterDigits === null) return null;
  let p = afterDigits;
  let isInt = true;

  // bare _ or __ → float (infinity), not integer
  if (
    p <= pos + 2 && src[pos] === "_" &&
    (p === pos + 1 || (p === pos + 2 && src[pos + 1] === "_"))
  ) {
    isInt = false;
  }

  // Optional decimal point + digits
  if (p < src.length && src[p] === ".") {
    const next = p + 1 < src.length ? src[p + 1] : "";
    if (isDigit(next) || next === "e" || isNumTerminator(src, p + 1)) {
      p++;
      p = scanWhile(src, p, isDigit);
      isInt = false;
    }
  }

  // Optional exponent
  if (p < src.length && src[p] === "e") {
    p++;
    p = tryChar(src, p, "_");
    const expEnd = scanWhile(src, p, isDigit);
    if (expEnd === p) return null; // 'e' without digits
    p = expEnd;
    isInt = false;
  }

  return { end: p, isInt };
}

/**
 * Lex uptocomplex: uptofloat (j uptofloat)?
 *
 * Derivation:
 *   lexUptocomplex = lexUptofloat >>= \r ->
 *                    optional('j' >> lexUptofloat) >>= \ext ->
 *                    pure (ext?.end ?? r.end)
 */
function lexUptocomplex(src: string, pos: number): number | null {
  const r = lexUptofloat(src, pos);
  if (r === null) return null;

  if (r.end < src.length && src[r.end] === "j") {
    const ext = lexUptofloat(src, r.end + 1);
    if (ext !== null) return ext.end;
  }

  return r.end;
}

/** Helper: lex radix suffix 'b' followed by alphanumeric */
function lexRadix(src: string, pos: number): number | null {
  if (pos >= src.length || src[pos] !== "b") return null;
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
 *   lexSuffix pos = tryPower pos <|> tryRadian pos <|> tryRadix pos
 *
 *   withRadix abstracts the repeated pattern:
 *     let r = lexRadix(end); if (r) {nk:"radix",end:r} else {nk,end}
 *   = { factor over nk, end }
 *     withRadix(nk, end) = lexRadix(end) >>= \r -> pure {nk:"radix",r} <|> pure {nk,end}
 */
function lexSuffix(
  src: string,
  pos: number,
): { nk: NumKind; end: number } | null {
  const withRadix = (nk: NumKind, end: number) => {
    const r = lexRadix(src, end);
    return r !== null ? { nk: "radix" as NumKind, end: r } : { nk, end };
  };

  // Power: r, p, x
  if (pos < src.length && "rpx".includes(src[pos])) {
    const rest = lexUptocomplex(src, pos + 1);
    if (rest !== null) return withRadix("power", rest);
  }

  // Radian: ar, ad
  if (
    pos + 1 < src.length && src[pos] === "a" &&
    (src[pos + 1] === "r" || src[pos + 1] === "d")
  ) {
    const rest = lexUptofloat(src, pos + 2);
    if (rest !== null) return withRadix("radian", rest.end);
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
 * The isInt flag from lexUptofloat eliminates re-scanning the parsed text.
 *
 * Derivation:
 *   lexNumberAtom = lexUptofloat >>= \(end, isInt) ->
 *     tryExtend isInt end
 *     <|> tryComplex end >>= trySuffix
 *     <|> trySuffix end
 *     <|> pure (baseKind isInt, end)
 */
function lexNumberAtom(
  src: string,
  pos: number,
): { nk: NumKind; end: number } | null {
  const r = lexUptofloat(src, pos);
  if (r === null) return null;

  // Extended precision: only after pure integer, not followed by alpha
  if (
    r.isInt &&
    r.end < src.length && src[r.end] === "x" &&
    !(r.end + 1 < src.length && isAlpha(src[r.end + 1]))
  ) {
    return { nk: "extend", end: r.end + 1 };
  }

  // Complex: j uptofloat
  if (r.end < src.length && src[r.end] === "j") {
    const ext = lexUptofloat(src, r.end + 1);
    if (ext !== null) {
      const suffix = lexSuffix(src, ext.end);
      if (suffix) return suffix;
      return { nk: "complex", end: ext.end };
    }
  }

  // Power/radian/radix suffixes
  const suffix = lexSuffix(src, r.end);
  if (suffix) return suffix;

  return { nk: r.isInt ? "integer" : "float", end: r.end };
}

// ── Direct definition helpers ───────────────────────────────────────────────

/**
 * Skip to matching }} respecting nesting.
 * Returns position of the first } in closing }}, or src.length if unmatched.
 */
function skipToMatchingBraces(src: string, pos: number): number {
  let depth = 1;
  let p = pos;
  while (p < src.length && depth > 0) {
    if (src[p] === "{" && p + 1 < src.length && src[p + 1] === "{") {
      depth++;
      p += 2;
    } else if (src[p] === "}" && p + 1 < src.length && src[p + 1] === "}") {
      depth--;
      if (depth === 0) return p;
      p += 2;
    } else {
      p++;
    }
  }
  return src.length;
}

// ── Main tokenizer ──────────────────────────────────────────────────────────

/**
 * Tokenize a J expression.
 *
 * Uses longest-match lexing: each iteration tries token types in order
 * until one matches, then continues from the new position.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const c = source[i];

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }

    // NB. comment — stop tokenizing
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
      tokens.push(
        closed
          ? { kind: "string", pos: "noun", text: value }
          : { kind: "error", message: "open quote" },
      );
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
          i = skipToMatchingBraces(source, i);
          if (i < len) i += 2;
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
          while (
            i < len && (source[i] === " " || source[i] === "\t")
          ) i++;
          if (i >= len || source[i] !== ":") {
            tokens.push({
              kind: "error",
              message: "expected ':' after direct definition kind",
            });
            i = skipToMatchingBraces(source, i);
            if (i < len) i += 2;
            continue;
          }
          i++;
        }

        const bodyStart = i;
        const p = skipToMatchingBraces(source, i);

        if (p >= len) {
          tokens.push({
            kind: "error",
            message: "unclosed direct definition",
          });
          i = len;
          continue;
        }

        const body = tokenize(source.slice(bodyStart, p));
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

      if (j < len && (source[j] === "." || source[j] === ":")) {
        const word = source.slice(i, j + 1);

        // NB. comment
        if (
          j - i === 2 && source[i] === "N" && source[i + 1] === "B" &&
          source[j] === "."
        ) {
          break;
        }

        // Single letter + dot/colon = primitive
        if (j - i === 1) {
          tokens.push({ kind: "prim", pos: classifyPrim(word), text: word });
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

    // Graphic primitives — flat if-chain derived from:
    //   longest match = try3 <|> try2 <|> try1
    //
    // The original loop `for (tryLen = 3; tryLen >= 1; tryLen--)` had
    // hardcoded per-length branches that never generalized. Unrolling:
    //   tryLen=3: only matches {::
    //   tryLen=2: c2 === "." || c2 === ":"
    //                (the original `|| (c==="`" && c2===":")` was dead:
    //                 A || (B && A) = A by absorption)
    //   tryLen=1: always matches
    if (isGraphic(c)) {
      let text: string;
      if (
        c === "{" && i + 2 < len &&
        source[i + 1] === ":" && source[i + 2] === ":"
      ) {
        text = "{::";
      } else if (i + 1 < len) {
        const c2 = source[i + 1];
        if (c2 === "." || c2 === ":") {
          text = source.slice(i, i + 2);
        } else {
          text = c;
        }
      } else {
        text = c;
      }

      tokens.push({ kind: "prim", pos: classifyPrim(text), text });
      i += text.length;
      continue;
    }

    // Standalone . and : (conjunctions when preceded by whitespace)
    if (c === "." || c === ":") {
      tokens.push({ kind: "prim", pos: "conj", text: c });
      i++;
      continue;
    }

    i++;
  }

  return tokens;
}
