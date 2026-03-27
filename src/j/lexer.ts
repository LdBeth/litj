import type { DirectKind, NumKind, Token } from "./ast.ts";

// ── Primitive classification tables ─────────────────────────────────────────

const ADVERBS = new Set([
  "~", "/", "\\", "/.", "\\.", "}", "b.", "f.", "M.",
]);

const CONJUNCTIONS = new Set([
  "^:", "@:", "@.", "&:", "&.", "&", "@", "!:", '":', "`:", "S:", "L:",
  "H.", "T.", "D:", "d.", ";.", "`", "!.",
]);

const GRAPHICS = new Set("=<>+*-%$~|,;#!/\\[]`@&?^\"".split(""));

const CONTROL_WORDS = new Set([
  "assert.", "break.", "continue.", "else.", "elseif.",
  "end.", "fcase.", "for.", "for_.", "if.", "do.",
  "goto_.", "label_.", "return.", "select.", "case.",
  "throw.", "try.", "catch.", "catchd.", "catcht.",
  "while.", "whilst.",
]);

// ── Helpers ─────────────────────────────────────────────────────────────────

function isAlpha(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isGraphic(c: string): boolean {
  return GRAPHICS.has(c) || c === "{" || c === "}";
}

// ── Number literal lexing ───────────────────────────────────────────────────

/** Try to lex a single number atom starting at pos i. Returns [numKind, endIndex] or null. */
function lexNumberAtom(
  src: string,
  i: number,
): { nk: NumKind; end: number } | null {
  const start = i;
  // Optional leading _
  if (i < src.length && src[i] === "_") i++;
  // Need at least one digit (unless bare _ or __)
  const digitStart = i;
  while (i < src.length && isDigit(src[i])) i++;
  const hasDigits = i > digitStart;

  // bare _ or __ (infinity)
  if (!hasDigits) {
    if (i === start + 1 && src[start] === "_") {
      // Could be __ (negative infinity)
      if (i < src.length && src[i] === "_") {
        return { nk: "float", end: i + 1 };
      }
      // single _ = infinity (float)
      return { nk: "float", end: i };
    }
    return null;
  }

  // Now we have integer digits. Check for suffixes.
  const afterInt = i;

  // Check for 'x' (extended)
  if (i < src.length && src[i] === "x" && !(i + 1 < src.length && isAlpha(src[i + 1]))) {
    return { nk: "extend", end: i + 1 };
  }

  // Try to lex float part (. and/or e)
  let floatEnd: number | null = null;
  const tryFloat = (pos: number): number => {
    let p = pos;
    let isFloat = false;
    // decimal point
    if (p < src.length && src[p] === ".") {
      // Ensure this isn't a primitive like +. or a control word
      // A number dot must be followed by digit, e, or end/space/operator
      const next = p + 1 < src.length ? src[p + 1] : "";
      if (isDigit(next) || next === "e" || next === "" || next === " " ||
          next === ")" || next === "\n" || next === "\r" ||
          isGraphic(next) || next === "'" || next === "j" ||
          next === "r" || next === "p" || next === "x" ||
          next === "b" || next === "a") {
        isFloat = true;
        p++; // skip .
        while (p < src.length && isDigit(src[p])) p++;
      }
    }
    // exponent
    if (p < src.length && src[p] === "e") {
      isFloat = true;
      p++;
      if (p < src.length && src[p] === "_") p++;
      while (p < src.length && isDigit(src[p])) p++;
    }
    return isFloat ? p : -1;
  };

  const fEnd = tryFloat(afterInt);
  if (fEnd > 0) floatEnd = fEnd;

  // uptofloat boundary
  const uptoFloat = floatEnd ?? afterInt;
  const baseKind: NumKind = floatEnd !== null ? "float" : "integer";

  // complex: j
  if (uptoFloat < src.length && src[uptoFloat] === "j") {
    const rest = lexUptofloat(src, uptoFloat + 1);
    if (rest !== null) {
      // uptocomplex boundary for further suffixes
      const uptoComplex = rest;
      // power/radian/radix after complex?
      const ext = lexExtendedSuffix(src, uptoComplex);
      if (ext) return ext;
      return { nk: "complex", end: uptoComplex };
    }
  }

  // power: r, p, x (but x after integer = extend, handled above)
  if (uptoFloat < src.length && "rpx".includes(src[uptoFloat])) {
    const ch = src[uptoFloat];
    if (ch === "r" || ch === "p" || ch === "x") {
      // Distinguish from radian 'ar'/'ad': only bare r/p/x here
      const rest = lexUptocomplex(src, uptoFloat + 1);
      if (rest !== null) {
        const ext = lexRadixSuffix(src, rest);
        if (ext) return ext;
        return { nk: "power", end: rest };
      }
    }
  }

  // radian: ar, ad
  if (uptoFloat + 1 < src.length && src[uptoFloat] === "a" &&
      (src[uptoFloat + 1] === "r" || src[uptoFloat + 1] === "d")) {
    const rest = lexUptofloat(src, uptoFloat + 2);
    if (rest !== null) {
      const ext = lexRadixSuffix(src, rest);
      if (ext) return ext;
      return { nk: "radian", end: rest };
    }
  }

  // radix: b after uptofloat/uptocomplex/power/radian
  const radixResult = lexRadixSuffix(src, uptoFloat);
  if (radixResult) return radixResult;

  // plain float or integer
  return { nk: baseKind, end: uptoFloat };
}

function lexRadixSuffix(
  src: string,
  pos: number,
): { nk: NumKind; end: number } | null {
  if (pos < src.length && src[pos] === "b") {
    const rdxStart = pos + 1;
    let p = rdxStart;
    while (p < src.length && (isDigit(src[p]) || (src[p] >= "a" && src[p] <= "z"))) p++;
    if (p > rdxStart) return { nk: "radix", end: p };
  }
  return null;
}

function lexExtendedSuffix(
  src: string,
  pos: number,
): { nk: NumKind; end: number } | null {
  // power
  if (pos < src.length && "rpx".includes(src[pos])) {
    const rest = lexUptocomplex(src, pos + 1);
    if (rest !== null) return { nk: "power", end: rest };
  }
  // radian
  if (pos + 1 < src.length && src[pos] === "a" &&
      (src[pos + 1] === "r" || src[pos + 1] === "d")) {
    const rest = lexUptofloat(src, pos + 2);
    if (rest !== null) return { nk: "radian", end: rest };
  }
  // radix
  return lexRadixSuffix(src, pos);
}

/** Lex an uptofloat: _? digits (. digits?)? (e _? digits)? */
function lexUptofloat(src: string, i: number): number | null {
  let p = i;
  if (p < src.length && src[p] === "_") p++;
  const dStart = p;
  while (p < src.length && isDigit(src[p])) p++;
  if (p === dStart) {
    // bare _ or __
    if (p === i + 1 && src[i] === "_") {
      if (p < src.length && src[p] === "_") return p + 1;
      return p;
    }
    return null;
  }
  // optional .digits
  if (p < src.length && src[p] === ".") {
    const next = p + 1 < src.length ? src[p + 1] : "";
    if (isDigit(next) || next === "e" || next === "" || next === " " ||
        next === ")" || isGraphic(next) || next === "j" ||
        next === "r" || next === "p" || next === "x" ||
        next === "b" || next === "a" || next === "\n") {
      p++;
      while (p < src.length && isDigit(src[p])) p++;
    }
  }
  // optional exponent
  if (p < src.length && src[p] === "e") {
    p++;
    if (p < src.length && src[p] === "_") p++;
    const eStart = p;
    while (p < src.length && isDigit(src[p])) p++;
    if (p === eStart) return null; // 'e' without digits is invalid
  }
  return p;
}

/** Lex an uptocomplex: uptofloat (j uptofloat)? */
function lexUptocomplex(src: string, i: number): number | null {
  const f = lexUptofloat(src, i);
  if (f === null) return null;
  if (f < src.length && src[f] === "j") {
    const rest = lexUptofloat(src, f + 1);
    if (rest !== null) return rest;
  }
  return f;
}

// ── Main tokenizer ──────────────────────────────────────────────────────────

/**
 * Tokenize a single J line (or expression) into classified tokens.
 * Handles recursive `{{ }}` direct definitions.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const c = source[i];

    // Skip whitespace
    if (c === " " || c === "\t") { i++; continue; }

    // Comment — stop tokenizing
    if (source.startsWith("NB.", i) &&
        (i + 3 >= len || !isAlpha(source[i + 3]))) {
      break;
    }

    // String literal
    if (c === "'") {
      i++;
      let value = "";
      while (i < len) {
        if (source[i] === "'") {
          if (i + 1 < len && source[i + 1] === "'") {
            value += "'";
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          value += source[i];
          i++;
        }
      }
      tokens.push({ kind: "string", pos: "noun", text: value });
      continue;
    }

    // Direct definition {{ ... }}
    if (c === "{" && i + 1 < len && source[i + 1] === "{") {
      i += 2; // skip {{
      // Check for )kind marker
      let defKind: DirectKind | null = null;
      let bodyStart = i;
      if (i < len && source[i] === ")") {
        i++;
        if (i < len && "mdvacn*".includes(source[i])) {
          defKind = source[i] as DirectKind;
          i++;
          bodyStart = i;
        } else {
          // not a kind marker, back up
          i--;
          bodyStart = i;
        }
      }
      // Scan for matching }} respecting nesting
      let depth = 1;
      let p = bodyStart;
      while (p < len && depth > 0) {
        if (source[p] === "{" && p + 1 < len && source[p + 1] === "{") {
          depth++;
          p += 2;
        } else if (source[p] === "}" && p + 1 < len && source[p + 1] === "}") {
          depth--;
          if (depth === 0) break;
          p += 2;
        } else {
          p++;
        }
      }
      const body = source.slice(bodyStart, p).trim();
      i = p + 2; // skip }}
      tokens.push({ kind: "direct", pos: "mark", defKind, body });
      continue;
    }

    // Parentheses
    if (c === "(") { tokens.push({ kind: "lpar", pos: "lpar" }); i++; continue; }
    if (c === ")") { tokens.push({ kind: "rpar", pos: "rpar" }); i++; continue; }

    // Copula
    if (c === "=" && i + 1 < len && (source[i + 1] === ":" || source[i + 1] === ".")) {
      tokens.push({ kind: "copula", pos: "copula", text: source.slice(i, i + 2) });
      i += 2;
      continue;
    }

    // Number: starts with digit or _ followed by digit, or bare _ (infinity)
    if (isDigit(c) || (c === "_" && (i + 1 >= len || isDigit(source[i + 1]) || source[i + 1] === "_" || source[i + 1] === "."))) {
      // Try to lex one or more space-separated number atoms as a single noun token
      const start = i;
      const atom = lexNumberAtom(source, i);
      if (atom) {
        const end = atom.end;
        const nk = atom.nk;
        // J allows space-separated number lists as a single noun: 1 2 3
        // But we produce one token per atom for simplicity matching the grammar
        i = end;
        tokens.push({ kind: "number", pos: "noun", nk, text: source.slice(start, end) });
        continue;
      }
      // Didn't match as number — fall through (bare _ might be infinity handled above)
    }

    // Name / keyword / control word / single-letter primitive
    if (isAlpha(c)) {
      let j = i + 1;
      while (j < len && (isAlpha(source[j]) || isDigit(source[j]) || source[j] === "_")) j++;

      // Check for trailing dot or colon (keyword/control word/primitive)
      if (j < len && (source[j] === "." || source[j] === ":")) {
        const word = source.slice(i, j + 1);

        // Check for NB. comment
        if (source.slice(i, j) === "NB" && source[j] === ".") {
          break; // rest is comment
        }

        // Single letter + dot/colon is a primitive (e.g., o., i., p.)
        if (j - i === 1) {
          const pos = ADVERBS.has(word) ? "adv" as const
            : CONJUNCTIONS.has(word) ? "conj" as const
            : "verb" as const;
          tokens.push({ kind: "prim", pos, text: word });
          i = j + 1;
          continue;
        }

        // Multi-letter + dot: check if it's a control word or keyword
        if (CONTROL_WORDS.has(word) || (source[i] >= "a" && source[i] <= "z")) {
          tokens.push({ kind: "keyword", pos: "mark", text: word });
          i = j + 1;
          continue;
        }
      }

      // locale suffixes: name_loc_ or name__loc
      let nameEnd = j;
      if (nameEnd < len && source[nameEnd] === "_") {
        if (nameEnd + 1 < len && source[nameEnd + 1] === "_") {
          // __locale
          nameEnd += 2;
          while (nameEnd < len && (isAlpha(source[nameEnd]) || isDigit(source[nameEnd]))) nameEnd++;
        } else {
          // _locale_
          nameEnd++;
          while (nameEnd < len && (isAlpha(source[nameEnd]) || isDigit(source[nameEnd]))) nameEnd++;
          if (nameEnd < len && source[nameEnd] === "_") nameEnd++;
        }
      }
      const name = source.slice(i, nameEnd);
      tokens.push({ kind: "name", pos: "name", text: name });
      i = nameEnd;
      continue;
    }

    // Primitives (graphics, possibly multi-char)
    if (isGraphic(c) || c === "{" || c === "}") {
      // Try longest match: up to 3 chars (e.g., {::)
      let best = "";
      let bestLen = 0;
      for (let tryLen = 3; tryLen >= 1; tryLen--) {
        if (i + tryLen > len) continue;
        const candidate = source.slice(i, i + tryLen);
        if (tryLen === 3) {
          // Known 3-char primitives
          if (candidate === "{::" || candidate === "}.:" || candidate === "{.:" ) {
            best = candidate; bestLen = tryLen; break;
          }
        }
        if (tryLen === 2) {
          const c2 = candidate[1];
          if (c2 === "." || c2 === ":") {
            best = candidate; bestLen = tryLen; break;
          }
          // backtick-colon
          if (c === "`" && c2 === ":") {
            best = candidate; bestLen = tryLen; break;
          }
        }
        if (tryLen === 1) {
          best = candidate; bestLen = tryLen; break;
        }
      }

      if (bestLen > 0) {
        const pos = ADVERBS.has(best) ? "adv" as const
          : CONJUNCTIONS.has(best) ? "conj" as const
          : "verb" as const;
        tokens.push({ kind: "prim", pos, text: best });
        i += bestLen;
        continue;
      }
    }

    // Skip unknown characters
    i++;
  }

  return tokens;
}
