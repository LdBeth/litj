import type { JNode, Pos, Token } from "./ast.ts";
import { tokenize } from "./lexer.ts";

/**
 * Parse a J source string into a JNode AST.
 *
 * Uses a shift-reduce strategy that implements J's parsing rules,
 * applied right-to-left on a stack of (part-of-speech, node) pairs.
 * Direct definitions (`{{ }}`) are recursively parsed.
 */
export function parseJ(source: string): JNode {
  const tokens = tokenize(source);
  return parseTokens(tokens);
}

// ── Stack entry ─────────────────────────────────────────────────────────────

type Entry = { pos: Pos; node: JNode };

function isEdge(pos: Pos): boolean {
  return pos === "mark" || pos === "verb" || pos === "adv" || pos === "conj" ||
    pos === "copula" || pos === "lpar";
}

function isNoun(pos: Pos): boolean {
  return pos === "noun";
}

function isVerb(pos: Pos): boolean {
  return pos === "verb";
}

function isVN(pos: Pos): boolean {
  return pos === "verb" || pos === "noun";
}

// ── Token → initial entry ───────────────────────────────────────────────────

function tokenToEntry(tok: Token): Entry {
  switch (tok.kind) {
    case "number":
      return { pos: "noun", node: { kind: "num", nk: tok.nk, text: tok.text } };
    case "string":
      return { pos: "noun", node: { kind: "str", value: tok.text } };
    case "name":
      return { pos: "name", node: { kind: "name", id: tok.text } };
    case "prim":
      return {
        pos: tok.pos,
        node: { kind: "prim", token: tok.text, pos: tok.pos },
      };
    case "copula":
      return {
        pos: "copula",
        node: { kind: "prim", token: tok.text, pos: "verb" },
      };
    case "keyword":
      return {
        pos: "mark",
        node: { kind: "prim", token: tok.text, pos: "verb" },
      };
    case "lpar":
      return { pos: "lpar", node: { kind: "prim", token: "(", pos: "verb" } };
    case "rpar":
      return { pos: "rpar", node: { kind: "prim", token: ")", pos: "verb" } };
    case "direct": {
      // Recursively parse the body of the direct definition
      const body = tok.body;
      return {
        pos: "noun",
        node: { kind: "direct", defKind: tok.defKind, body },
      };
    }
  }
}

// ── Shift-reduce parser ─────────────────────────────────────────────────────

/**
 * J parsing rules (applied right-to-left):
 *
 *   0. Monad:       edge V N          → noun
 *   1. Dyad:        edge N V N        → noun
 *   2. Adverb:      (V|N) A           → verb
 *   3. Conjunction:  (V|N) C (V|N)    → verb
 *   4. Fork:        edge V V V        → verb
 *   5. Hook:        edge V V          → verb
 *   6. Assignment:  name copula expr  → noun
 *   7. Paren:       lpar X rpar       → X (with its pos)
 *
 * "edge" = mark | verb | adv | conj | copula
 */
function parseTokens(tokens: Token[]): JNode {
  if (tokens.length === 0) {
    return { kind: "seq", stmts: [] };
  }

  const stack: Entry[] = [{
    pos: "mark",
    node: { kind: "prim", token: "", pos: "verb" },
  }];

  // Push tokens left-to-right
  for (let i = 0; i < tokens.length; i++) {
    stack.push(tokenToEntry(tokens[i]));
    reduce(stack);
  }

  // Final reduction pass
  reduceFinal(stack);

  // Collect results (skip the mark sentinel at index 0)
  const results: JNode[] = [];
  for (let i = 1; i < stack.length; i++) {
    results.push(stack[i].node);
  }

  if (results.length === 0) return { kind: "seq", stmts: [] };
  if (results.length === 1) return results[0];
  return { kind: "seq", stmts: results };
}

function reduce(stack: Entry[]): void {
  // Keep reducing while we can
  let changed = true;
  while (changed) {
    changed = false;
    const n = stack.length;

    // Adverb: (V|N) A → verb
    if (n >= 2) {
      const a = stack[n - 2], b = stack[n - 1];
      if (isVN(a.pos) && b.pos === "adv") {
        stack.length = n - 2;
        stack.push({
          pos: "verb",
          node: { kind: "adv", verb: a.node, adv: b.node },
        });
        changed = true;
        continue;
      }
    }

    // Conjunction: (V|N) C (V|N) → verb
    if (n >= 3) {
      const a = stack[n - 3], b = stack[n - 2], c = stack[n - 1];
      if (isVN(a.pos) && b.pos === "conj" && isVN(c.pos)) {
        stack.length = n - 3;
        stack.push({
          pos: "verb",
          node: { kind: "conj", left: a.node, con: b.node, right: c.node },
        });
        changed = true;
        continue;
      }
    }

    // The remaining rules require an "edge" to the left.
    // We check with 4 entries on stack for fork/dyad, 3 for monad/hook.

    // Fork: edge V V V → edge verb
    if (n >= 4) {
      const a = stack[n - 4],
        b = stack[n - 3],
        c = stack[n - 2],
        d = stack[n - 1];
      if (isEdge(a.pos) && isVerb(b.pos) && isVerb(c.pos) && isVerb(d.pos)) {
        stack.length = n - 3;
        stack.push({
          pos: "verb",
          node: { kind: "fork", f: b.node, g: c.node, h: d.node },
        });
        changed = true;
        continue;
      }
    }

    // Dyad: edge N V N → edge noun
    if (n >= 4) {
      const a = stack[n - 4],
        b = stack[n - 3],
        c = stack[n - 2],
        d = stack[n - 1];
      if (isEdge(a.pos) && isNoun(b.pos) && isVerb(c.pos) && isNoun(d.pos)) {
        stack.length = n - 3;
        stack.push({
          pos: "noun",
          node: { kind: "dyad", verb: c.node, left: b.node, right: d.node },
        });
        changed = true;
        continue;
      }
    }

    // Monad: edge V N → edge noun
    if (n >= 3) {
      const a = stack[n - 3], b = stack[n - 2], c = stack[n - 1];
      if (isEdge(a.pos) && isVerb(b.pos) && isNoun(c.pos)) {
        stack.length = n - 2;
        stack.push({
          pos: "noun",
          node: { kind: "monad", verb: b.node, arg: c.node },
        });
        changed = true;
        continue;
      }
    }

    // Hook: edge V V → edge verb
    // NOTE: Hook is NOT applied during the main reduction loop to avoid
    // premature reduction when a 3rd verb might be coming (which would make it a fork).
    // Hook is only applied in reduceFinal after all tokens are pushed.

    // Paren: lpar X rpar → X (unwrap, keeping the inner pos)
    if (n >= 3) {
      const a = stack[n - 3], b = stack[n - 2], c = stack[n - 1];
      if (a.pos === "lpar" && c.pos === "rpar") {
        // Remove lpar, X, rpar and push X back
        stack.length = n - 3;
        stack.push(b);
        changed = true;
        continue;
      }
    }

    // Name promotion: promote names to nouns when no other rule applies
    // This is the LAST rule - only fires when all other reductions have been tried
    // Don't promote if prev is copula (would be "copula name") or mark (could be "name copula ...")
    if (n >= 2) {
      const prev = stack[n - 2];
      const curr = stack[n - 1];
      if (curr.pos === "name" && prev.pos !== "copula" && prev.pos !== "mark") {
        stack[n - 1] = { pos: "noun", node: curr.node };
        changed = true;
        continue;
      }
    }
  }
}

/** Reduce assignment patterns: name copula X → assign */
function reduceAssignment(stack: Entry[]): void {
  let changed = true;
  while (changed) {
    changed = false;
    const n = stack.length;

    // Assignment: name copula X → noun
    if (n >= 3) {
      const a = stack[n - 3], b = stack[n - 2], c = stack[n - 1];
      if (a.pos === "name" && b.pos === "copula") {
        const global =
          (b.node as { kind: "prim"; token: string }).token === "=:";
        const name = (a.node as { kind: "name"; id: string }).id;
        stack.length = n - 3;
        stack.push({
          pos: "noun",
          node: { kind: "assign", name, global, expr: c.node },
        });
        changed = true;
        continue;
      }
    }
  }
}

/** Reduce hook patterns: edge V V → edge verb */
function reduceHook(stack: Entry[]): void {
  let changed = true;
  while (changed) {
    changed = false;
    const n = stack.length;

    // Hook: edge V V → edge verb
    if (n >= 3) {
      const a = stack[n - 3], b = stack[n - 2], c = stack[n - 1];
      if (isEdge(a.pos) && isVerb(b.pos) && isVerb(c.pos)) {
        stack.length = n - 2;
        stack.push({
          pos: "verb",
          node: { kind: "hook", f: b.node, g: c.node },
        });
        changed = true;
        continue;
      }
    }
  }
}

/** Final pass: promote names to nouns, reduce assignments, and try final reductions. */
function reduceFinal(stack: Entry[]): void {
  // First, reduce assignments (before promoting names)
  reduceAssignment(stack);

  // Promote remaining names to nouns
  for (let i = 0; i < stack.length; i++) {
    if (stack[i].pos === "name") {
      stack[i] = { pos: "noun", node: stack[i].node };
    }
  }

  // Try final reductions (this will apply fork, dyad, monad, etc.)
  reduce(stack);

  // Apply hook reduction (after fork has been tried)
  reduceHook(stack);

  // Try reductions again (to apply paren unwrapping after hook)
  reduce(stack);
}
