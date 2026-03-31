import type {
  DirectKind,
  NumKind,
  PrimToken,
  Token,
  ValidToken,
} from "./ast.ts";

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
// deno-fmt-ignore
const NOUNS = new Set(["_","__","_.","a.","a:"]);

// deno-fmt-ignore
const VERBS = new Set(["=","<",">","+","*","-","%","$","|",",",
  ";","#","!","[","]","{","}","?","^",'"',"<.","<:",">.",">:","+.",
  "+:","*.","*:","-.","-:","%.","%:","$.","$:","|.","|:",",.",",:",
  ";:","#.","#:","!.","!:","[:","{.","{:","{::","}.","}:","?.","^.",
  '".','":',"~.","~:","/:","\\:","i.","i:","j.","o.","p.","p:","q:",
  "r.","s:","u:","x:","A.","C.","E.","I.","L.","L:","0:","1:","2:",
  "3:","4:","5:","6:","7:","8:","9:","e.","t.","t:"]);

// deno-fmt-ignore
const ADVERBS = new Set(["~","/","\\","/.","/..","\\.","}","b.","f.","M."]);

// deno-fmt-ignore
const CONJUNCTIONS = new Set([".",":","^:","@:","@.","&:","&.","&.:","&","@",
  "`:","S:","H.","T.","D:","D.","d.",";.","`","F.","F..","F.:","F:.",
  "F::"]);

// deno-fmt-ignore
const COPULAS = new Set(["=.","=:",]);

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
  "if.",
  "do.",
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

const KEYWORD_PATTERNS = [
  /^for_\w*\.$/,
  /^goto_\w*\.$/,
  /^label_\w*\.$/,
];

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
function classifyPrim(text: string): Token {
  if (COPULAS.has(text)) return { kind: "copula", pos: "copula", text };
  if (NOUNS.has(text)) return { kind: "prim", pos: "noun", text };
  if (ADVERBS.has(text)) return { kind: "prim", pos: "adv", text };
  if (CONJUNCTIONS.has(text)) return { kind: "prim", pos: "conj", text };
  if (VERBS.has(text)) return { kind: "prim", pos: "verb", text };
  return { kind: "unknown", pos: "mark", text };
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
    if (p > pos) {
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
    src[pos] === "_" &&
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

/** Consume trailing . and : characters */
function scanDotColon(src: string, pos: number): number {
  return scanWhile(src, pos, (c) => c === "." || c === ":");
}

/** Classify an alpha-start token */
function classifyAlpha(text: string): Token {
  // Conditional fusion: both branches yield { kind: "keyword", pos: "mark", text }
  if (CONTROL_WORDS.has(text) || KEYWORD_PATTERNS.some((p) => p.test(text))) {
    return { kind: "keyword", pos: "mark", text };
  }
  return classifyPrim(text);
}

/** Classify a digit/underscore-start token */
function classifyNumeric(src: string, pos: number, end: number): Token {
  const text = src.slice(pos, end);
  // Try known primitives first
  const prim = classifyPrim(text);
  if (prim.kind !== "unknown") return prim;
  // Try parsing as a number literal
  const atom = lexNumberAtom(src, pos);
  if (atom && atom.end === end) {
    return { kind: "number", pos: "noun", nk: atom.nk, text };
  }
  // prim is already { kind: "unknown", pos: "mark", text }
  return prim;
}

// ── Main tokenizer ──────────────────────────────────────────────────────────

/**
 * Tokenize a J expression.
 *
 * Three core tokenization rules for non-string, non-direct-definition tokens:
 *   Rule 1 (graphic-start): single GRAPHIC or : or ., then any number of . and :
 *   Rule 2 (alpha-start): alpha, then [a-zA-Z0-9_]*, then any number of . and :
 *   Rule 3 (digit/underscore-start): digit or _, then [a-zA-Z0-9_.]*, then any number of . and :
 *
 * After forming the raw token text, classify by lookup in primitive tables.
 */
/** Returns true if every token in the array is a ValidToken (no errors or unknowns). */
export function isValidTokens(tokens: Token[]): tokens is ValidToken[] {
  return tokens.every((t) => t.kind !== "error" && t.kind !== "unknown");
}

export function isPrimTokens(tokens: ValidToken[]): tokens is PrimToken[] {
  return tokens.every((t) => t.kind !== "name" && t.kind !== "keyword");
}

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
    // Scan-slice deforestation: indexOf finds quote boundaries,
    // slice grabs segments — eliminates char-by-char concatenation.
    if (c === "'") {
      i++;
      let value = "";
      for (;;) {
        const q = source.indexOf("'", i);
        if (q === -1) {
          tokens.push({ kind: "error", message: "open quote" });
          i = len;
          break;
        }
        value += source.slice(i, q);
        if (q + 1 < len && source[q + 1] === "'") {
          value += "'";
          i = q + 2;
        } else {
          i = q + 1;
          tokens.push({ kind: "string", pos: "noun", text: value });
          break;
        }
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

    // Rule 2: Alpha-start token
    if (isAlpha(c)) {
      const j = scanWhile(
        source,
        i + 1,
        (ch) => isAlpha(ch) || isDigit(ch) || ch === "_",
      );
      const suffixEnd = scanDotColon(source, j);
      if (suffixEnd > j) {
        // Has dot/colon suffix — classify as primitive/keyword/unknown
        const text = source.slice(i, suffixEnd);
        tokens.push(classifyAlpha(text));
        i = suffixEnd;
      } else {
        // Pure name — handle locale suffixes
        let nameEnd = j;
        if (nameEnd < len && source[nameEnd] === "_") {
          const double = nameEnd + 1 < len && source[nameEnd + 1] === "_";
          nameEnd += double ? 2 : 1;
          nameEnd = scanWhile(
            source,
            nameEnd,
            (ch) => isAlpha(ch) || isDigit(ch),
          );
          if (!double && nameEnd < len && source[nameEnd] === "_") nameEnd++;
        }
        tokens.push({
          kind: "name",
          pos: "name",
          text: source.slice(i, nameEnd),
        });
        i = nameEnd;
      }
      continue;
    }

    // Rule 3: Digit/underscore-start token
    if (isDigit(c) || c === "_") {
      const bodyEnd = scanWhile(
        source,
        i + 1,
        (ch) => isAlpha(ch) || isDigit(ch) || ch === "_" || ch === ".",
      );
      const suffixEnd = scanDotColon(source, bodyEnd);

      if (suffixEnd > bodyEnd) {
        // Has dot/colon suffix — no array merging possible
        tokens.push(classifyNumeric(source, i, suffixEnd));
        i = suffixEnd;
      } else {
        // No suffix — look ahead for consecutive rule-3 tokens to merge
        // Variable elimination: peek ≡ arrayEnd (invariant: both init to bodyEnd, both set to nb)
        let arrayEnd = bodyEnd;
        while (arrayEnd < len) {
          const wsEnd = scanWhile(
            source,
            arrayEnd,
            (ch) => ch === " " || ch === "\t",
          );
          if (wsEnd === arrayEnd || wsEnd >= len) break;
          const nc = source[wsEnd];
          if (!(isDigit(nc) || nc === "_")) break;
          const nb = scanWhile(
            source,
            wsEnd + 1,
            (ch) => isAlpha(ch) || isDigit(ch) || ch === "_" || ch === ".",
          );
          if (scanDotColon(source, nb) > nb) break;
          arrayEnd = nb;
        }

        if (arrayEnd > bodyEnd) {
          tokens.push({
            kind: "array",
            pos: "noun",
            text: source.slice(i, arrayEnd),
          });
        } else {
          tokens.push(classifyNumeric(source, i, bodyEnd));
        }
        i = arrayEnd;
      }
      continue;
    }

    // Rule 1: Graphic-start or standalone . and :
    if (isGraphic(c) || c === "." || c === ":") {
      const suffixEnd = scanDotColon(source, i + 1);
      const text = source.slice(i, suffixEnd);
      tokens.push(classifyPrim(text));
      i = suffixEnd;
      continue;
    }

    i++;
  }

  return tokens;
}
