import type { EPos, JNode, PrimToken } from "./ast.ts";
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

type StackItem = JNode | { kind: "tmp"; pos: EPos };

function tokenToStackItem(t: PrimToken): StackItem {
  switch (t.kind) {
    case "number":
      return { kind: "num", nk: t.nk, text: t.text, pos: "noun" };
    case "string":
      return { kind: "str", value: t.text, pos: "noun" };
    case "array":
      return { kind: "prim", token: t.text, pos: "noun" };
    case "prim":
      return { kind: "prim", token: t.text, pos: t.pos };
    case "direct_noun":
      return { kind: "prim", token: t.body, pos: "noun" };
    case "copula":
      return { kind: "tmp", pos: "copula" };
    case "lpar":
      return { kind: "tmp", pos: "lpar" };
    case "rpar":
      return { kind: "tmp", pos: "rpar" };
  }
}

// --- Part-of-speech predicates ---

/** EDGE = MARK + ASGN(copula) + LPAR */
function isEdge(pos: EPos): boolean {
  return pos === "mark" || pos === "copula" || pos === "lpar";
}

/** AVN = ADV + VERB + NOUN */
function isAVN(pos: EPos): boolean {
  return pos === "adv" || pos === "verb" || pos === "noun";
}

/** CAVN = CONJ + ADV + VERB + NOUN */
function isCAVN(pos: EPos): boolean {
  return pos === "conj" || isAVN(pos);
}

/** VN = VERB + NOUN */
function isVN(pos: EPos): boolean {
  return pos === "verb" || pos === "noun";
}

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
 *   EDGE         V           N           any        0 Monad   (consume b,c)
 *   EDGE+AVN     V           V           N          1 Monad   (consume c,d)
 *   EDGE+AVN     N           V           N          2 Dyad    (consume b,c,d)
 *   EDGE+AVN     V+N         A           any        3 Adverb  (consume b,c)
 *   EDGE+AVN     V+N         C           V+N        4 Conj    (consume b,c,d)
 *   EDGE+AVN     V+N         V           V          5 Fork    (consume b,c,d)
 *   EDGE         CAVN        CAVN        any        6 Bident  (consume b,c)
 *   NAME+N       ASGN        CAVN        any        7 Is      (consume a,b,c)
 *   LPAR         CAVN        RPAR        any        8 Paren   (consume a,b,c)
 *
 * Returns true if a reduction was applied.
 */
function tryReduce(stack: StackItem[]): boolean {
  const len = stack.length;
  if (len < 4) return false;

  const a = stack[len - 1]; // top
  const b = stack[len - 2];
  const c = stack[len - 3];
  const d = stack[len - 4]; // deepest of top 4

  const ap = a.pos;
  const bp = b.pos;
  const cp = c.pos;
  const dp = d.pos;

  // Rule 0: EDGE V N any → consume b(V), c(N) → noun
  if (isEdge(ap) && bp === "verb" && cp === "noun") {
    stack.splice(len - 3, 2, <JNode> {
      kind: "monad",
      verb: b,
      arg: c,
      pos: "noun",
    });
    return true;
  }

  // Rule 1: (EDGE+AVN) V V N → consume c(V), d(N) → noun
  if ((isEdge(ap) || isAVN(ap)) && bp === "verb" && cp === "verb" && dp === "noun") {
    stack.splice(len - 4, 2, <JNode> {
      kind: "monad",
      verb: c,
      arg: d,
      pos: "noun",
    });
    return true;
  }

  // Rule 2: (EDGE+AVN) N V N → consume b(N), c(V), d(N) → noun
  if ((isEdge(ap) || isAVN(ap)) && bp === "noun" && cp === "verb" && dp === "noun") {
    stack.splice(len - 4, 3, <JNode> {
      kind: "dyad",
      verb: c,
      left: b,
      right: d,
      pos: "noun",
    });
    return true;
  }

  // Rule 3: (EDGE+AVN) (V+N) A any → consume b(V+N), c(A) → verb
  if ((isEdge(ap) || isAVN(ap)) && isVN(bp) && cp === "adv") {
    stack.splice(len - 3, 2, <JNode> {
      kind: "adv",
      verb: b,
      adv: c,
      pos: "verb",
    });
    return true;
  }

  // Rule 4: (EDGE+AVN) (V+N) C (V+N) → consume b, c, d → verb
  if ((isEdge(ap) || isAVN(ap)) && isVN(bp) && cp === "conj" && isVN(dp)) {
    stack.splice(len - 4, 3, <JNode> {
      kind: "conj",
      left: b,
      con: c,
      right: d,
      pos: "verb",
    });
    return true;
  }

  // Rule 5: (EDGE+AVN) (V+N) V V → consume b, c, d → verb (fork/trident)
  if ((isEdge(ap) || isAVN(ap)) && isVN(bp) && cp === "verb" && dp === "verb") {
    stack.splice(len - 4, 3, <JNode> {
      kind: "fork",
      f: b,
      g: c,
      h: d,
      pos: "verb",
    });
    return true;
  }

  // Rule 6: EDGE CAVN CAVN any → consume b, c → verb (bident/hook)
  if (isEdge(ap) && isCAVN(bp) && isCAVN(cp)) {
    stack.splice(len - 3, 2, <JNode> {
      kind: "hook",
      f: b,
      g: c,
      pos: "verb",
    });
    return true;
  }

  // Rule 7: (NAME+N) ASGN CAVN any → consume a, b, c
  // Skipped: parsePrimTokens does not handle names/assignment

  // Rule 8: LPAR CAVN RPAR any → consume a, b, c → pos of b
  // a=lpar at len-1, b=CAVN at len-2, c=rpar at len-3. Keep b.
  if (ap === "lpar" && isCAVN(bp) && cp === "rpar") {
    stack.splice(len - 1, 1);    // remove a (lpar), now b is at len-2, c at len-3
    stack.splice(len - 3, 1);    // remove c (rpar)
    return true;
  }

  return false;
}

function parsePrimTokens(tokens: PrimToken[]): JNode {
  // Stack initialized with 4 marks (per J spec)
  const mark: StackItem = { kind: "tmp", pos: "mark" };
  const stack: StackItem[] = [mark, mark, mark, mark];

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
