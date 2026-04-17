import type { JNode, NumKind, Pos } from "./ast.ts";

/**
 * Pattern language for matching JNode trees.
 *
 * Wildcards bind a name; concrete node patterns mirror JNode constructors
 * but allow sub-patterns (JPat) as children, so e.g. a `dyad` pattern can
 * have a `wildN` in its `left` slot.
 */
export type JPat =
  | { kind: "wild"; id: string } // matches any node
  | { kind: "wildV"; id: string } // matches verb nodes only
  | { kind: "wildN"; id: string } // matches noun nodes only
  | { kind: "num"; nk: NumKind; text: string; pos: "noun" }
  | { kind: "arr"; text: string; pos: "noun" }
  | { kind: "str"; value: string; pos: "noun" }
  | { kind: "name"; id: string; pos: Pos }
  | { kind: "prim"; token: string; pos: Pos | "copula" }
  | {
    kind: "assign";
    name: JPat;
    global: boolean;
    expr: JPat;
    pos: Pos;
  }
  | { kind: "monad"; verb: JPat; arg: JPat; pos: "noun" }
  | { kind: "dyad"; verb: JPat; left: JPat; right: JPat; pos: "noun" }
  | { kind: "hook"; f: JPat; g: JPat; pos: Pos }
  | { kind: "fork"; f: JPat; g: JPat; h: JPat; pos: Pos }
  | { kind: "adv"; verb: JPat; adv: JPat; pos: Pos }
  | { kind: "conj"; left: JPat; con: JPat; right: JPat; pos: Pos };

export type Bindings = Map<string, JNode>;

export type Rule = { from: JPat; to: JPat };

const MAX_STEPS = 10_000;

/** Structural equality for JNode trees. */
function jEqual(a: JNode, b: JNode): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "num": {
      const y = b as Extract<JNode, { kind: "num" }>;
      return a.nk === y.nk && a.text === y.text;
    }
    case "arr":
      return a.text === (b as Extract<JNode, { kind: "arr" }>).text;
    case "str":
      return a.value === (b as Extract<JNode, { kind: "str" }>).value;
    case "name": {
      const y = b as Extract<JNode, { kind: "name" }>;
      return a.id === y.id && a.pos === y.pos;
    }
    case "prim": {
      const y = b as Extract<JNode, { kind: "prim" }>;
      return a.token === y.token && a.pos === y.pos;
    }
    case "assign": {
      const y = b as Extract<JNode, { kind: "assign" }>;
      return a.global === y.global && a.pos === y.pos &&
        jEqual(a.name, y.name) && jEqual(a.expr, y.expr);
    }
    case "monad": {
      const y = b as Extract<JNode, { kind: "monad" }>;
      return jEqual(a.verb, y.verb) && jEqual(a.arg, y.arg);
    }
    case "dyad": {
      const y = b as Extract<JNode, { kind: "dyad" }>;
      return jEqual(a.verb, y.verb) && jEqual(a.left, y.left) &&
        jEqual(a.right, y.right);
    }
    case "hook": {
      const y = b as Extract<JNode, { kind: "hook" }>;
      return a.pos === y.pos && jEqual(a.f, y.f) && jEqual(a.g, y.g);
    }
    case "fork": {
      const y = b as Extract<JNode, { kind: "fork" }>;
      return a.pos === y.pos && jEqual(a.f, y.f) && jEqual(a.g, y.g) &&
        jEqual(a.h, y.h);
    }
    case "adv": {
      const y = b as Extract<JNode, { kind: "adv" }>;
      return a.pos === y.pos && jEqual(a.verb, y.verb) && jEqual(a.adv, y.adv);
    }
    case "conj": {
      const y = b as Extract<JNode, { kind: "conj" }>;
      return a.pos === y.pos && jEqual(a.left, y.left) &&
        jEqual(a.con, y.con) && jEqual(a.right, y.right);
    }
  }
}

// Matching has no alternatives/backtracking: a single shared Bindings map
// is threaded through the recursion and mutated in place. If a sub-match
// fails, `null` propagates up and the partially-populated map is discarded
// by the caller.
function bind(
  bs: Bindings,
  id: string,
  node: JNode,
): Bindings | null {
  const prior = bs.get(id);
  if (prior !== undefined) return jEqual(prior, node) ? bs : null;
  bs.set(id, node);
  return bs;
}

function matchInto(
  pat: JPat,
  node: JNode,
  bs: Bindings,
): Bindings | null {
  switch (pat.kind) {
    case "wild":
      return bind(bs, pat.id, node);
    case "wildV":
      return node.pos === "verb" ? bind(bs, pat.id, node) : null;
    case "wildN":
      return node.pos === "noun" ? bind(bs, pat.id, node) : null;
  }
  // Concrete JNode pattern: structural match.
  if (pat.kind !== node.kind) return null;
  switch (pat.kind) {
    // Leaf pattern kinds share JNode's shape exactly, so jEqual suffices.
    case "num":
    case "arr":
    case "str":
    case "name":
    case "prim":
      return jEqual(pat as JNode, node) ? bs : null;
    case "assign": {
      const n = node as Extract<JNode, { kind: "assign" }>;
      if (pat.global !== n.global || pat.pos !== n.pos) return null;
      const b1 = matchInto(pat.name, n.name, bs);
      if (!b1) return null;
      return matchInto(pat.expr, n.expr, b1);
    }
    case "monad": {
      const n = node as Extract<JNode, { kind: "monad" }>;
      const b1 = matchInto(pat.verb, n.verb, bs);
      if (!b1) return null;
      return matchInto(pat.arg, n.arg, b1);
    }
    case "dyad": {
      const n = node as Extract<JNode, { kind: "dyad" }>;
      const b1 = matchInto(pat.verb, n.verb, bs);
      if (!b1) return null;
      const b2 = matchInto(pat.left, n.left, b1);
      if (!b2) return null;
      return matchInto(pat.right, n.right, b2);
    }
    case "hook": {
      const n = node as Extract<JNode, { kind: "hook" }>;
      if (pat.pos !== n.pos) return null;
      const b1 = matchInto(pat.f, n.f, bs);
      if (!b1) return null;
      return matchInto(pat.g, n.g, b1);
    }
    case "fork": {
      const n = node as Extract<JNode, { kind: "fork" }>;
      if (pat.pos !== n.pos) return null;
      const b1 = matchInto(pat.f, n.f, bs);
      if (!b1) return null;
      const b2 = matchInto(pat.g, n.g, b1);
      if (!b2) return null;
      return matchInto(pat.h, n.h, b2);
    }
    case "adv": {
      const n = node as Extract<JNode, { kind: "adv" }>;
      if (pat.pos !== n.pos) return null;
      const b1 = matchInto(pat.verb, n.verb, bs);
      if (!b1) return null;
      return matchInto(pat.adv, n.adv, b1);
    }
    case "conj": {
      const n = node as Extract<JNode, { kind: "conj" }>;
      if (pat.pos !== n.pos) return null;
      const b1 = matchInto(pat.left, n.left, bs);
      if (!b1) return null;
      const b2 = matchInto(pat.con, n.con, b1);
      if (!b2) return null;
      return matchInto(pat.right, n.right, b2);
    }
  }
}

/** Match pat against node, returning bindings on success or null on failure. */
export function match(pat: JPat, node: JNode): Bindings | null {
  return matchInto(pat, node, new Map());
}

/** Instantiate a pattern with the given bindings. */
export function substitute(pat: JPat, bindings: Bindings): JNode {
  switch (pat.kind) {
    case "wild":
    case "wildV":
    case "wildN": {
      const v = bindings.get(pat.id);
      if (v === undefined) {
        throw new Error(`substitute: unbound wildcard '${pat.id}'`);
      }
      return v;
    }
    case "num":
    case "arr":
    case "str":
    case "name":
    case "prim":
      return pat;
    case "assign":
      return {
        kind: "assign",
        name: substitute(pat.name, bindings) as JNode & { pos: "noun" },
        global: pat.global,
        expr: substitute(pat.expr, bindings),
        pos: pat.pos,
      };
    case "monad":
      return {
        kind: "monad",
        verb: substitute(pat.verb, bindings),
        arg: substitute(pat.arg, bindings),
        pos: "noun",
      };
    case "dyad":
      return {
        kind: "dyad",
        verb: substitute(pat.verb, bindings),
        left: substitute(pat.left, bindings),
        right: substitute(pat.right, bindings),
        pos: "noun",
      };
    case "hook":
      return {
        kind: "hook",
        f: substitute(pat.f, bindings),
        g: substitute(pat.g, bindings),
        pos: pat.pos,
      };
    case "fork":
      return {
        kind: "fork",
        f: substitute(pat.f, bindings),
        g: substitute(pat.g, bindings),
        h: substitute(pat.h, bindings),
        pos: pat.pos,
      };
    case "adv":
      return {
        kind: "adv",
        verb: substitute(pat.verb, bindings),
        adv: substitute(pat.adv, bindings),
        pos: pat.pos,
      };
    case "conj":
      return {
        kind: "conj",
        left: substitute(pat.left, bindings),
        con: substitute(pat.con, bindings),
        right: substitute(pat.right, bindings),
        pos: pat.pos,
      };
  }
}

/** Rewrite children, reassembling only if something changed. */
function rewriteChildren(
  rules: Rule[],
  node: JNode,
  steps: { n: number },
): JNode {
  switch (node.kind) {
    case "num":
    case "arr":
    case "str":
    case "name":
    case "prim":
      return node;
    case "assign": {
      const name = rewriteStep(rules, node.name, steps) as typeof node.name;
      const expr = rewriteStep(rules, node.expr, steps);
      if (name === node.name && expr === node.expr) return node;
      return { ...node, name, expr };
    }
    case "monad": {
      const verb = rewriteStep(rules, node.verb, steps);
      const arg = rewriteStep(rules, node.arg, steps);
      if (verb === node.verb && arg === node.arg) return node;
      return { ...node, verb, arg };
    }
    case "dyad": {
      const verb = rewriteStep(rules, node.verb, steps);
      const left = rewriteStep(rules, node.left, steps);
      const right = rewriteStep(rules, node.right, steps);
      if (
        verb === node.verb && left === node.left && right === node.right
      ) return node;
      return { ...node, verb, left, right };
    }
    case "hook": {
      const f = rewriteStep(rules, node.f, steps);
      const g = rewriteStep(rules, node.g, steps);
      if (f === node.f && g === node.g) return node;
      return { ...node, f, g };
    }
    case "fork": {
      const f = rewriteStep(rules, node.f, steps);
      const g = rewriteStep(rules, node.g, steps);
      const h = rewriteStep(rules, node.h, steps);
      if (f === node.f && g === node.g && h === node.h) return node;
      return { ...node, f, g, h };
    }
    case "adv": {
      const verb = rewriteStep(rules, node.verb, steps);
      const adv = rewriteStep(rules, node.adv, steps);
      if (verb === node.verb && adv === node.adv) return node;
      return { ...node, verb, adv };
    }
    case "conj": {
      const left = rewriteStep(rules, node.left, steps);
      const con = rewriteStep(rules, node.con, steps);
      const right = rewriteStep(rules, node.right, steps);
      if (
        left === node.left && con === node.con && right === node.right
      ) return node;
      return { ...node, left, con, right };
    }
  }
}

function rewriteStep(
  rules: Rule[],
  node: JNode,
  steps: { n: number },
): JNode {
  let cur = rewriteChildren(rules, node, steps);
  outer:
  while (true) {
    for (const r of rules) {
      const bs = match(r.from, cur);
      if (bs) {
        if (++steps.n > MAX_STEPS) {
          throw new Error(`rewrite: exceeded MAX_STEPS (${MAX_STEPS})`);
        }
        cur = rewriteChildren(rules, substitute(r.to, bs), steps);
        continue outer;
      }
    }
    return cur;
  }
}

/**
 * Apply rules bottom-up to node, rewriting until no rule matches.
 * Returns a new JNode (or the same reference if nothing changed).
 */
export function rewrite(rules: Rule[], node: JNode): JNode {
  return rewriteStep(rules, node, { n: 0 });
}
