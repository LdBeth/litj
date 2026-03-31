import { assertEquals } from "@std/assert";
import { parseJ } from "../src/j/parser.ts";

Deno.test("parse conjunction derivation", () => {
  const ast = parseJ("9&o.");
  assertEquals(ast.kind, "conj");
});

Deno.test("parse adverb derivation", () => {
  const ast = parseJ("+/");
  assertEquals(ast.kind, "adv");
});

Deno.test("parse hook 1", () => {
  const ast = parseJ("+-");
  assertEquals(ast.kind, "hook");
});

Deno.test("parse hook 2", () => {
  const ast = parseJ("(+-)");
  assertEquals(ast.kind, "hook");
});

Deno.test("parse fork 1", () => {
  const ast = parseJ("+*-");
  assertEquals(ast.kind, "fork");
});

Deno.test("parse fork 2", () => {
  const ast = parseJ("(+*-)");
  assertEquals(ast.kind, "fork");
});

Deno.test("parse fork 3", () => {
  const ast = parseJ("1+*");
  assertEquals(ast.kind, "fork");
});

Deno.test("parse paren 1", () => {
  const ast1 = parseJ("+(+1)");
  const ast2 = parseJ("++1");
  assertEquals(ast1, ast2);
});

Deno.test("parse paren 2", () => {
  const ast1 = parseJ("1+2+1");
  const ast2 = parseJ("1+(2+1)");
  assertEquals(ast1, ast2);
});
