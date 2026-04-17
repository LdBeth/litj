import { assert, assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { parseJ } from "../src/j/parser.ts";
import { printJ } from "../src/j/print.ts";
import { match, rewrite, substitute } from "../src/j/rewrite.ts";
import type { JPat, Rule } from "../src/j/rewrite.ts";
import type { JNode } from "../src/j/ast.ts";

// ── match ────────────────────────────────────────────────────────────────────

Deno.test("match: atom num equality", () => {
  const n = parseJ("42");
  const bs = match(n, n);
  assert(bs);
  assertEquals(bs.size, 0);
});

Deno.test("match: atom num mismatch", () => {
  assertEquals(match(parseJ("1"), parseJ("2")), null);
});

Deno.test("match: wild binds any", () => {
  const n = parseJ("1+2");
  const bs = match({ kind: "wild", id: "x" }, n);
  assert(bs);
  assertStrictEquals(bs.get("x"), n);
});

Deno.test("match: wildV rejects noun", () => {
  assertEquals(match({ kind: "wildV", id: "v" }, parseJ("5")), null);
});

Deno.test("match: wildN rejects verb", () => {
  assertEquals(match({ kind: "wildN", id: "n" }, parseJ("+")), null);
});

Deno.test("match: wildV accepts verb prim", () => {
  const bs = match({ kind: "wildV", id: "v" }, parseJ("+"));
  assert(bs);
});

Deno.test("match: non-linear same binding succeeds", () => {
  // pattern: x + x, matched against 3+3
  const pat: JPat = {
    kind: "dyad",
    verb: { kind: "prim", token: "+", pos: "verb" },
    left: { kind: "wildN", id: "x" },
    right: { kind: "wildN", id: "x" },
    pos: "noun",
  };
  const bs = match(pat, parseJ("3+3"));
  assert(bs);
  assertEquals((bs.get("x") as JNode).kind, "num");
});

Deno.test("match: non-linear diverging binding fails", () => {
  const pat: JPat = {
    kind: "dyad",
    verb: { kind: "prim", token: "+", pos: "verb" },
    left: { kind: "wildN", id: "x" },
    right: { kind: "wildN", id: "x" },
    pos: "noun",
  };
  assertEquals(match(pat, parseJ("3+4")), null);
});

Deno.test("match: structural recursion into dyad", () => {
  const pat: JPat = {
    kind: "dyad",
    verb: { kind: "wildV", id: "v" },
    left: { kind: "wildN", id: "l" },
    right: { kind: "wildN", id: "r" },
    pos: "noun",
  };
  const bs = match(pat, parseJ("1+2"));
  assert(bs);
  assertEquals((bs.get("v") as JNode & { kind: "prim" }).token, "+");
});

// ── substitute ───────────────────────────────────────────────────────────────

Deno.test("substitute: wildcard lookup", () => {
  const bs = new Map<string, JNode>([["x", parseJ("7")]]);
  const out = substitute({ kind: "wildN", id: "x" }, bs);
  assertEquals(printJ(out), "7");
});

Deno.test("substitute: unbound wildcard throws", () => {
  assertThrows(
    () => substitute({ kind: "wild", id: "missing" }, new Map()),
    Error,
    "unbound",
  );
});

Deno.test("substitute: rebuilds concrete structure", () => {
  const bs = new Map<string, JNode>([
    ["v", parseJ("+")],
    ["y", parseJ("5")],
  ]);
  const pat: JPat = {
    kind: "dyad",
    verb: { kind: "wildV", id: "v" },
    left: { kind: "wildN", id: "y" },
    right: { kind: "wildN", id: "y" },
    pos: "noun",
  };
  const out = substitute(pat, bs);
  assertEquals(printJ(out), "5 + 5");
});

// ── rewrite ──────────────────────────────────────────────────────────────────

Deno.test("rewrite: identity when no rule matches", () => {
  const n = parseJ("1+2");
  assertStrictEquals(rewrite([], n), n);
});

Deno.test("rewrite: reflex law  f~ y  →  y f y", () => {
  // from: (v ~) y          (monad of adv(v, `~`) applied to noun y)
  // to:   y v y            (dyad)
  const rule: Rule = {
    from: {
      kind: "monad",
      verb: {
        kind: "adv",
        verb: { kind: "wildV", id: "v" },
        adv: { kind: "prim", token: "~", pos: "adv" },
        pos: "verb",
      },
      arg: { kind: "wildN", id: "y" },
      pos: "noun",
    },
    to: {
      kind: "dyad",
      verb: { kind: "wildV", id: "v" },
      left: { kind: "wildN", id: "y" },
      right: { kind: "wildN", id: "y" },
      pos: "noun",
    },
  };
  const out = rewrite([rule], parseJ("f~ 5"));
  assertEquals(printJ(out), "5 f 5");
});

Deno.test("rewrite: applies bottom-up through containing expression", () => {
  // Rule: any   x + x   →   2 * x   (for the noun wildcard).
  const rule: Rule = {
    from: {
      kind: "dyad",
      verb: { kind: "prim", token: "+", pos: "verb" },
      left: { kind: "wildN", id: "x" },
      right: { kind: "wildN", id: "x" },
      pos: "noun",
    },
    to: {
      kind: "dyad",
      verb: { kind: "prim", token: "*", pos: "verb" },
      left: { kind: "num", nk: "integer", text: "2", pos: "noun" },
      right: { kind: "wildN", id: "x" },
      pos: "noun",
    },
  };
  // outer expr:  1 - (3 + 3)    → rewrite inner to  2 * 3
  const out = rewrite([rule], parseJ("1-3+3"));
  assertEquals(printJ(out), "1 - (2 * 3)");
});
