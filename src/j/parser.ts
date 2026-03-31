import type { JNode, Pos, PrimToken } from "./ast.ts";
import { isPrimTokens, isValidTokens, tokenize } from "./lexer.ts";

/**
 * Parse a J source string into a JNode AST.
 *
 * Implements J's parsing rules,
 * applied right-to-left on a stack of (part-of-speech, node) pairs.
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

type StackItem = { pos: Pos; node: JNode | null };

function tokenToStackItem(t: PrimToken): StackItem {
  switch (t.kind) {
    case "number":
      return { pos: "noun", node: { kind: "num", nk: t.nk, text: t.text } };
    case "string":
      return { pos: "noun", node: { kind: "str", value: t.text } };
    case "array":
      return {
        pos: "noun",
        node: { kind: "prim", token: t.text, pos: "noun" },
      };
    case "prim":
      return {
        pos: t.pos,
        node: { kind: "prim", token: t.text, pos: t.pos },
      };
    case "direct":
      return {
        pos: "verb",
        node: { kind: "direct", defKind: t.defKind, body: "" },
      };
    case "direct_noun":
      return {
        pos: "noun",
        node: { kind: "prim", token: t.body, pos: "noun" },
      };
    case "copula":
      return { pos: "copula", node: null };
    case "lpar":
    case "rpar":
      // handled separately in parsePrimTokens
      return { pos: t.pos, node: null };
  }
}

function isVN(pos: Pos): boolean {
  return pos === "verb" || pos === "noun";
}

function isVNA(pos: Pos): boolean {
  return pos === "verb" || pos === "noun" || pos === "adv";
}

function isVNAC(pos: Pos): boolean {
  return isVNA(pos) || pos === "conj";
}

function isGuard(pos: Pos): boolean {
  return pos === "mark" || pos === "lpar" || pos === "copula";
}

function isHardGuard(pos: Pos): boolean {
  return pos === "mark" || pos === "lpar";
}

/**
 * Try to apply one reduction rule to the stack (top = last element).
 * Returns true if a reduction was applied.
 *
 * Stack is stored with index 0 = bottom (mark), last = top.
 * s0 = stack[len-1] (top), s1 = stack[len-2], s2 = stack[len-3], s3 = stack[len-4].
 */
function tryReduce(stack: StackItem[]): boolean {
  const len = stack.length;
  if (len < 2) return false;

  const s0 = stack[len - 1];
  const s1 = stack[len - 2];
  const s2 = len >= 3 ? stack[len - 3] : null;
  const s3 = len >= 4 ? stack[len - 4] : null;

  // Stack layout (top = s0):
  //   s3  s2  s1  s0
  // 2-slot rules consume s1+s0 and need guard at s2
  // 3-slot rules consume s2+s1+s0 and need guard at s3

  // Rule 3 (adverb): (V|N|A|C) A → verb
  // s1 in {V,N,A,C}, s0.pos == "adv"
  if (s1.pos === "adv" && isVNAC(s0.pos)) {
    stack.splice(len - 2, 2, {
      pos: "verb",
      node: { kind: "adv", verb: s0.node!, adv: s1.node! },
    });
    return true;
  }

  // Rule 4 (conjunction): (V|N) C (V|N) → verb
  // s0=left(V|N), s1=conj, s2=right(V|N)  [right-to-left: right pushed first]
  if (s2 && s1.pos === "conj" && isVN(s0.pos) && isVN(s2.pos)) {
    stack.splice(len - 3, 3, {
      pos: "verb",
      node: { kind: "conj", left: s0.node!, con: s1.node!, right: s2.node! },
    });
    return true;
  }

  // Rule 0 (monad): guard V N → noun
  // (right-to-left: noun pushed first=s1, verb pushed second=s0)
  if (s2 && isGuard(s2.pos) && s0.pos === "verb" && s1.pos === "noun") {
    stack.splice(len - 2, 2, {
      pos: "noun",
      node: { kind: "monad", verb: s0.node!, arg: s1.node! },
    });
    return true;
  }

  // Rules 5, 6, 7, 2: fork/hook/dyad need a hard guard.
  // Fork (3-slot) needs guard at s3; hook (2-slot) needs guard at s2.
  // Fork is checked before hook so that V V V → fork, not hook+V.
  if (!s3) {
    // Only 3 items on stack: guard must be s2.
    // Rule 7 (hook): guard (A|V) V → hook
    if (
      s2 && isHardGuard(s2.pos) && s0.pos === "verb" &&
      (s1.pos === "adv" || s1.pos === "verb")
    ) {
      stack.splice(len - 2, 2, {
        pos: "verb",
        node: { kind: "hook", f: s0.node!, g: s1.node! },
      });
      return true;
    }
    return false;
  }

  const guard = s3.pos;

  // Rule 5 (fork): guard V V V → fork
  if (
    isHardGuard(guard) && s0.pos === "verb" && s1.pos === "verb" &&
    s2!.pos === "verb"
  ) {
    stack.splice(len - 3, 3, {
      pos: "verb",
      node: { kind: "fork", f: s0.node!, g: s1.node!, h: s2!.node! },
    });
    return true;
  }

  // Rule 6 (noun-fork): guard N V V → fork
  if (
    isHardGuard(guard) && s0.pos === "verb" && s1.pos === "verb" &&
    s2!.pos === "noun"
  ) {
    stack.splice(len - 3, 3, {
      pos: "verb",
      node: { kind: "fork", f: s0.node!, g: s1.node!, h: s2!.node! },
    });
    return true;
  }

  // Rule 7 (hook): guard (A|V) V → hook
  if (
    isHardGuard(guard) && s0.pos === "verb" &&
    (s1.pos === "adv" || s1.pos === "verb")
  ) {
    stack.splice(len - 2, 2, {
      pos: "verb",
      node: { kind: "hook", f: s0.node!, g: s1.node! },
    });
    return true;
  }

  // Rule 2 (dyad): guard N V N → dyad
  if (
    isHardGuard(guard) && s0.pos === "noun" && s1.pos === "verb" &&
    s2!.pos === "noun"
  ) {
    stack.splice(len - 3, 3, {
      pos: "noun",
      node: { kind: "dyad", verb: s1.node!, left: s0.node!, right: s2!.node! },
    });
    return true;
  }

  return false;
}

function reduce(stack: StackItem[]): void {
  while (tryReduce(stack)) {
    // keep reducing
  }
}

function reduceUntilLpar(stack: StackItem[]): void {
  // Reduce until the top of stack is guarded by lpar
  // i.e., until stack[len-2] is lpar (so lpar becomes the guard)
  while (stack.length >= 2 && stack[stack.length - 2].pos !== "lpar") {
    if (!tryReduce(stack)) break;
  }
}

function parsePrimTokens(tokens: PrimToken[]): JNode {
  const stack: StackItem[] = [{ pos: "mark", node: null }];

  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === "rpar") {
      // Push lpar sentinel (marks start of parenthesized sub-expression)
      stack.push({ pos: "lpar", node: null });
    } else if (t.kind === "lpar") {
      // Reduce all pending items above the lpar sentinel
      reduceUntilLpar(stack);
      // lpar sentinel is now at stack[len-2]; remove it
      const len = stack.length;
      if (len >= 2 && stack[len - 2].pos === "lpar") {
        stack.splice(len - 2, 1);
      }
      // Continue reducing with lpar removed
      reduce(stack);
    } else {
      stack.push(tokenToStackItem(t));
    }
  }

  // Reduce all tokens after full shift
  reduce(stack);

  if (stack.length !== 2 || stack[0].pos !== "mark") {
    throw Error(
      `Parse error: unexpected stack state [${
        stack.map((s) => s.pos).join(", ")
      }]`,
    );
  }

  return stack[1].node!;
}
