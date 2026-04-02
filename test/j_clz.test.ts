import { assertEquals } from "@std/assert";
import { isValidTokens, tokenize } from "../src/j/lexer.ts";
import { parseJ } from "../src/j/parser.ts";

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
  "zmax =: 9&o. >.&:| 11&o.",
  "rlog2t =: (^.@:+:)`((^.2)+^.)@.(hmpf<!.(0)zmax)",
  "zacosle =: ([: rmsignum 11&o.)*j.@:rlog2t",
  "zasinh =: zasin&.:j.",
  "zacosh =: (rsignum@:(11&o.))*(j.@:zacos)",
];

for (const line of CLZ_LINES) {
  Deno.test(`lex clz.ijs: ${line.slice(0, 40)}...`, () => {
    const tokens = tokenize(line);
    // Should produce at least one token and not throw
    assertEquals(tokens.length > 0, true, `No tokens for: ${line}`);
    assertEquals(isValidTokens(tokens), true, `Invalid result for: ${line}`);
  });
}

Deno.test("parse zsin", () => {
  const ast = parseJ("9&o.(((6:o.])*1:o.[)j.(5:o.])*2:o.[)11&o.");
  assertEquals(ast.kind, "fork");
});

Deno.test("parse zsin assignment structure", () => {
  const ast = parseJ("zsin =: 9&o.(((6:o.])*1:o.[)j.(5:o.])*2:o.[)11&o.");
  assertEquals(ast.kind, "assign");
  if (ast.kind === "assign") {
    assertEquals(ast.name.kind, "name");
    if (ast.name.kind === "name") {
      assertEquals(ast.name.id, "zsin");
    }
    assertEquals(ast.global, true);
  }
});

/*
for (const line of CLZ_LINES) {
  Deno.test(`parse clz.ijs: ${line.slice(0, 40)}...`, () => {
    const ast = parseJ(line);
    // Should produce a valid AST node
    assertEquals(typeof ast.kind, "string", `Bad AST for: ${line}`);
  });
}

// Specific structural checks on parsed clz.ijs lines

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
 */
