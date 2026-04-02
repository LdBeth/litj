import type { EPos, JNode, Name, Pos, PPos, PrimToken } from "./ast.ts";
import { isPrimTokens, isValidTokens, tokenize } from "./lexer.ts";

/**
 * Parse a J source string into a JNode AST.
 *
 * Implements J's parsing rules from Dictionary §E,
 * applied via a queue-to-stack shift-reduce algorithm.
 */
export function parseJ(source: string): JNode {
  const tokens = tokenize(source);
  if (!isValidTokens(tokens)) {
    throw Error("Tokenizing error");
  }
  if (!isPrimTokens(tokens)) {
    throw Error("Only primitives are allowed");
  }
  return parsePrimTokens(tokens);
}

type StackItem = JNode | { pos: Exclude<EPos, Pos> };

function tokenToStackItem(t: PrimToken): StackItem {
  switch (t.kind) {
    case "number":
      return { kind: "num", nk: t.nk, text: t.text, pos: "noun" };
    case "string":
      return { kind: "str", value: t.text, pos: "noun" };
    case "array":
      return { kind: "arr", text: t.text, pos: "noun" };
    case "prim":
      return { kind: "prim", token: t.text, pos: t.pos };
    case "direct_noun":
      return { kind: "str", value: t.body, pos: "noun" };
    case "name":
      return { kind: "name", id: t.text, pos: "verb" }; // assume name to be verb
    case "copula":
      return { kind: "prim", token: t.text, pos: "copula" };
    case "lpar":
      return { pos: "lpar" };
    case "rpar":
      return { pos: "rpar" };
  }
}

// --- Part-of-speech predicates ---

/** EDGE = MARK + ASGN(copula) + LPAR */
function isEdge(i: StackItem): boolean {
  return i.pos === "mark" || i.pos === "copula" || i.pos === "lpar";
}

/** EDGE + AVN (+ NAME) = everything on the stack except RPAR and CONJ.
 *  Note: includes "name", which is not in the J Dictionary EDGE+AVN set,
 *  but name in position a is harmless since no other rule condition fires on it. */
function isEdgeAVN(i: StackItem): boolean {
  return i.pos !== "rpar" && i.pos !== "conj";
}

/** CAVN = CONJ + ADV + VERB + NOUN */
function isCAVN(i: StackItem): i is JNode & { pos: Pos } {
  return i.pos === "conj" || i.pos === "adv" || i.pos === "verb" ||
    i.pos === "noun";
}

/** VN = VERB + NOUN */
function isVN(i: StackItem): i is JNode & { pos: Pos } {
  return i.pos === "verb" || i.pos === "noun";
}

function is(i: StackItem, p: PPos): i is JNode & { pos: typeof p } {
  return i.pos === p;
}

function isName(i: StackItem): i is Name {
  return ("kind" in i && i.kind === "name");
}

function modTrident(b: Pos, c: Pos, d: Pos): Pos {
  const table: Record<string, Pos> = {
    vvc: "conj",
    nvc: "conj",
    nca: "adv",
    ncc: "conj",
    vca: "adv",
    cvc: "conj",
    vcc: "conj",
    aca: "conj",
    acc: "conj",
    cca: "conj",
    ccc: "conj",
    vnc: "adv",
    avv: "adv",
    cvv: "conj",
    aav: "conj",
    aaa: "adv",
    caa: "conj",
    acn: "adv",
    acv: "adv",
    ccn: "conj",
    ccv: "conj",
  };
  return table[b[0] + c[0] + d[0]] ?? "verb";
}

function modBident(b: Pos, c: Pos): Pos {
  const table: Record<string, Pos> = {
    nc: "adv",
    vc: "adv",
    av: "adv",
    aa: "adv",
    ac: "adv",
    cn: "adv",
    cv: "adv",
    ca: "conj",
    cc: "conj",
  };
  return table[b[0] + c[0]] ?? "verb";
}

type Mark = StackItem & { pos: "mark" };
type Stack = [Mark, Mark, Mark, Mark, ...StackItem[]];

/**
 * Try to apply one reduction rule to the stack.
 *
 * The stack is stored with index 0 = bottom (deepest marks).
 * The "first four elements" of the stack (per J spec) are the top 4.
 * In the parse table, column 1 = top of stack, column 4 = deepest of top 4.
 *
 * We name them: a = stack[len-1] (top), b = stack[len-2],
 *               c = stack[len-3], d = stack[len-4] (deepest of top 4).
 *
 * Parse table (from Dictionary §E):
 *   a(top)       b           c           d          Rule
 *   EDGE         V           N           any        0 Monad         (consume b,c)
 *   EDGE+AVN     V           V           N          1 Monad         (consume c,d)
 *   EDGE+AVN     N           V           N          2 Dyad          (consume b,c,d)
 *   EDGE+AVN     V+N         A           any        3 Adverb        (consume b,c)
 *   EDGE+AVN     V+N         C           V+N        4 Conj          (consume b,c,d)
 *   EDGE+AVN     V+N         V           V          5 Fork          (consume b,c,d)
 *   EDGE         CAVN        CAVN        CAVN       6 Mod trident   (consume b,c,d)
 *   EDGE         CAVN        CAVN        any        7 Hook/bident   (consume b,c)
 *   NAME+N       ASGN        CAVN        any        8 Is            (consume a,b,c)
 *   LPAR         CAVN        RPAR        any        9 Paren         (consume a,b,c)
 *
 * Returns true if a reduction was applied.
 */
function tryReduce(stack: Stack): boolean {
  const len = stack.length;

  const a: StackItem = stack[len - 1]; // top
  const b: StackItem = stack[len - 2];
  const c: StackItem = stack[len - 3];
  const d: StackItem = stack[len - 4]; // deepest of top 4

  const ap = a.pos;
  const bp = b.pos;
  const cp = c.pos;
  const dp = d.pos;

  // Rule 0: EDGE V N any → consume b(V), c(N) → noun
  if (isEdge(a) && is(b, "verb") && is(c, "noun")) {
    stack.splice(
      len - 3,
      2,
      {
        kind: "monad",
        verb: b,
        arg: c,
        pos: "noun",
      },
    );
    return true;
  }

  // Rule 1: (EDGE+AVN) V V N → consume c(V), d(N) → noun
  if (isEdgeAVN(a) && bp === "verb" && cp === "verb" && dp === "noun") {
    stack.splice(
      len - 4,
      2,
      {
        kind: "monad",
        verb: c,
        arg: d,
        pos: "noun",
      },
    );
    return true;
  }

  // Rule 2: (EDGE+AVN) N V N → consume b(N), c(V), d(N) → noun
  if (isEdgeAVN(a) && bp === "noun" && cp === "verb" && dp === "noun") {
    stack.splice(
      len - 4,
      3,
      {
        kind: "dyad",
        verb: c,
        left: b,
        right: d,
        pos: "noun",
      },
    );
    return true;
  }

  // Rule 3: (EDGE+AVN) (V+N) A any → consume b(V+N), c(A) → verb
  if (isEdgeAVN(a) && isVN(b) && cp === "adv") {
    stack.splice(
      len - 3,
      2,
      {
        kind: "adv",
        verb: b,
        adv: c,
        pos: "verb",
      },
    );
    return true;
  }

  // Rule 4: (EDGE+AVN) (V+N) C (V+N) → consume b, c, d → verb
  if (isEdgeAVN(a) && isVN(b) && cp === "conj" && isVN(d)) {
    stack.splice(
      len - 4,
      3,
      {
        kind: "conj",
        left: b,
        con: c,
        right: d,
        pos: "verb",
      },
    );
    return true;
  }

  // Rule 5: (EDGE+AVN) (V+N) V V → consume b, c, d → verb (fork/trident)
  if (isEdgeAVN(a) && isVN(b) && cp === "verb" && dp === "verb") {
    stack.splice(
      len - 4,
      3,
      {
        kind: "fork",
        f: b,
        g: c,
        h: d,
        pos: "verb",
      },
    );
    return true;
  }

  // Rules 6 & 7: EDGE CAVN ... — only reached when Rules 0–5 didn't match.
  // Since isEdge ⊆ isEdgeAVN, Rules 0–5 were also candidates; their failure
  // is an implicit guard (e.g. Rule 6 implies ¬(bp=verb ∧ cp=noun) etc.).

  // Rule 6: EDGE CAVN CAVN CAVN → modifier trident → consume b,c,d
  if (isEdge(a) && isCAVN(b) && isCAVN(c) && isCAVN(d)) {
    stack.splice(
      len - 4,
      3,
      {
        kind: "fork",
        f: b,
        g: c,
        h: d,
        pos: modTrident(b.pos, c.pos, d.pos),
      },
    );
    return true;
  }

  // Rule 7: EDGE CAVN CAVN any → hook or modifier bident → consume b,c
  if (isEdge(a) && isCAVN(b) && isCAVN(c)) {
    stack.splice(
      len - 3,
      2,
      {
        kind: "hook",
        f: b,
        g: c,
        pos: modBident(b.pos, c.pos),
      },
    );
    return true;
  }

  // Rule 8: (NAME|N) COPULA CAVN any → Is → consume a,b,c
  if ((isName(a) || is(a, "noun")) && is(b, "copula") && isCAVN(c)) {
    stack.splice(
      len - 3,
      3,
      {
        kind: "assign",
        name: <Name | (JNode & { pos: "noun" })> a,
        global: (<JNode & { pos: "copula" }> b).token === "=:",
        expr: c,
        pos: c.pos,
      },
    );
    return true;
  }

  // Rule 9: LPAR CAVN RPAR any → Paren → consume a,b,c → pos of b
  if (ap === "lpar" && isCAVN(b) && cp === "rpar") {
    stack.splice(len - 3, 3, b); // replace [rpar, cavn, lpar] with cavn
    return true;
  }

  return false;
}

function parsePrimTokens(tokens: PrimToken[]): JNode {
  // Stack initialized with 4 marks (per J spec)
  const mark: Mark = { pos: "mark" };
  const stack: Stack = [mark, mark, mark, mark];

  // Queue: § token1 token2 ... (sentence prefixed by mark)
  // Move from the tail end of the queue to the top of the stack.
  // Tokens move right-to-left, then the § prefix moves last.
  let qi = tokens.length - 1;

  for (;;) {
    // Try to reduce the top 4 stack items
    if (tryReduce(stack)) {
      continue; // After a successful reduction, try again
    }

    // No reduction: move next element from queue to stack
    if (qi >= 0) {
      stack.push(tokenToStackItem(tokens[qi]));
      qi--;
    } else if (qi === -1) {
      // Push the § mark prefix of the queue
      stack.push(mark);
      qi = -2;
    } else {
      break; // Queue fully exhausted (including § prefix)
    }
  }

  // Stack should be: [mark, mark, mark, mark, result, mark]
  // The § prefix ended up on top, and the result is below it.
  // Actually after the § is pushed, rule 0/6 may reduce further.
  // Final state: 4 bottom marks + mark(§) + result, or just 4+1+result.
  // Let me check: after all reductions the § on top acts as EDGE guard.
  // The result should be between bottom marks and top §.

  // Find the result: skip bottom marks and top mark
  if (
    stack.length !== 6 ||
    stack[0].pos !== "mark" ||
    stack[5].pos !== "mark"
  ) {
    throw Error(
      `Parse error: unexpected stack state [${
        stack.map((s) => s.pos).join(", ")
      }]`,
    );
  }

  return <JNode> stack[4];
}
