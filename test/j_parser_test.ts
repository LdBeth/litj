import { assertEquals } from "@std/assert";
import { tokenize } from "../src/j/lexer.ts";
import { parseJ } from "../src/j/parser.ts";

// ── Parser tests ────────────────────────────────────────────────────────────

Deno.test("parse monad", () => {
  const ast = parseJ("- y");
  assertEquals(ast.kind, "monad");
});

Deno.test("parse dyad", () => {
  const ast = parseJ("x + y");
  assertEquals(ast.kind, "dyad");
  if (ast.kind === "dyad") {
    assertEquals(ast.left.kind, "name");
    assertEquals(ast.right.kind, "name");
  }
});

Deno.test("parse assignment", () => {
  const ast = parseJ("x =. 3");
  assertEquals(ast.kind, "assign");
  if (ast.kind === "assign") {
    assertEquals(ast.name, "x");
    assertEquals(ast.global, false);
  }
});

Deno.test("parse global assignment", () => {
  const ast = parseJ("x =: 3");
  assertEquals(ast.kind, "assign");
  if (ast.kind === "assign") {
    assertEquals(ast.global, true);
  }
});

Deno.test("parse conjunction derivation", () => {
  const ast = parseJ("9&o.");
  assertEquals(ast.kind, "conj");
});

Deno.test("parse adverb derivation", () => {
  const ast = parseJ("+/");
  assertEquals(ast.kind, "adv");
});

Deno.test("parse hook 1", () => {
  const ast = parseJ("+ -");
  assertEquals(ast.kind, "hook");
});

Deno.test("parse hook 2", () => {
  const ast = parseJ("(+ -)");
  assertEquals(ast.kind, "hook");
});

Deno.test("parse fork 1", () => {
  const ast = parseJ("+ * -");
  assertEquals(ast.kind, "fork");
});

Deno.test("parse fork 2", () => {
  const ast = parseJ("(+ * -)");
  assertEquals(ast.kind, "fork");
});

Deno.test("parse parenthesized expression", () => {
  const ast = parseJ("(x + y)");
  assertEquals(ast.kind, "dyad");
});

Deno.test("parse direct definition", () => {
  const ast = parseJ("{{)m x + y }}");
  assertEquals(ast.kind, "direct");
  if (ast.kind === "direct") {
    assertEquals(ast.defKind, "m");
  }
});

// ── clz.ijs integration tests ──────────────────────────────────────────────

const CLZ_LINES = [
  "zsin =: 9&o.(((6:o.])*1:o.[)j.(5:o.])*2:o.[)11&o.",
  "zcos =: 9&o.(((6:o.])*2:o.[)j.(5:o.])-@:*1:o.[)11&o.",
  "rinvcosh =: ([:%6&o.)`(+:@:^@:-@:|)@.(20<|)",
  "zsinh =: 9&o.(((2:o.])*5:o.[)j.(1:o.])*6:o.[)11&o.",
  "zcosh =: 9&o.(((2:o.])*6:o.[)j.(1:o.])*5:o.[)11&o.",
  "rlog1p =: (([:^.])-(<:@:]-[)% ])>:",
  "rsignum =: 1 _1{~ 0 > _3 ic 2 fc ]",
  "rmsignum =: _1 1{~ 0 > _3 ic 2 fc ]",
  "zasinle =: {{ rlog2t&.:((rmsignum 11&o. y) * j.) y }}",
  "zasin =: {{)m",
  "zmax =: 9&o. >.&:| 11&o.",
  "rlog2t =: (^.@:+:)`((^.2)+^.)@.(hmpf<!.(0)zmax)",
  "zacos =: {{)m",
  "zacosle =: ([: rmsignum 11&o.)*j.@:rlog2t",
  "zasinh =: zasin&.:j.",
  "zacosh =: (rsignum@:(11&o.))*(j.@:zacos)",
];

for (const line of CLZ_LINES) {
  Deno.test(`lex clz.ijs: ${line.slice(0, 40)}...`, () => {
    const tokens = tokenize(line);
    // Should produce at least one token and not throw
    assertEquals(tokens.length > 0, true, `No tokens for: ${line}`);
  });
}

for (const line of CLZ_LINES) {
  Deno.test(`parse clz.ijs: ${line.slice(0, 40)}...`, () => {
    const ast = parseJ(line);
    // Should produce a valid AST node
    assertEquals(typeof ast.kind, "string", `Bad AST for: ${line}`);
  });
}

// Specific structural checks on parsed clz.ijs lines

Deno.test("parse zsin assignment structure", () => {
  const ast = parseJ("zsin =: 9&o.(((6:o.])*1:o.[)j.(5:o.])*2:o.[)11&o.");
  assertEquals(ast.kind, "assign");
  if (ast.kind === "assign") {
    assertEquals(ast.name, "zsin");
    assertEquals(ast.global, true);
  }
});

Deno.test("parse zmax structure", () => {
  const ast = parseJ("zmax =: 9&o. >.&:| 11&o.");
  assertEquals(ast.kind, "assign");
  if (ast.kind === "assign") {
    assertEquals(ast.name, "zmax");
    // The expr should be a fork: (9&o.) (>.&:|) (11&o.)
    assertEquals(ast.expr.kind, "fork");
  }
});

Deno.test("parse simple expressions from clz.ijs body", () => {
  // These appear inside direct definitions
  const exprs = [
    "*:tx",
    "3 o. 9 o. y",
    ">:tx2**:ty",
    "tx2=.*:tx=.3 o. 9 o. y",
  ];
  for (const expr of exprs) {
    const ast = parseJ(expr);
    assertEquals(typeof ast.kind, "string", `Failed to parse: ${expr}`);
  }
});

Deno.test("parse direct def with recursive body", () => {
  const ast = parseJ("zasinle =: {{ rlog2t&.:((rmsignum 11&o. y) * j.) y }}");
  assertEquals(ast.kind, "assign");
  if (ast.kind === "assign") {
    assertEquals(ast.expr.kind, "direct");
  }
});
