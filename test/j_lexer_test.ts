import { assertEquals } from "@std/assert";
import { tokenize } from "../src/j/lexer.ts";

// ── Lexer tests ─────────────────────────────────────────────────────────────

Deno.test("lex simple assignment", () => {
  const tokens = tokenize("x =. 3");
  assertEquals(tokens.length, 3);
  assertEquals(tokens[0], { kind: "name", pos: "name", text: "x" });
  assertEquals(tokens[1], { kind: "copula", pos: "copula", text: "=." });
  assertEquals(tokens[2], {
    kind: "number",
    pos: "noun",
    nk: "integer",
    text: "3",
  });
});

Deno.test("lex string literal", () => {
  const tokens = tokenize("'hello''world'");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], { kind: "string", pos: "noun", text: "hello'world" });
});

Deno.test("lex negative number", () => {
  const tokens = tokenize("_4");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], {
    kind: "number",
    pos: "noun",
    nk: "integer",
    text: "_4",
  });
});

Deno.test("lex float", () => {
  const tokens = tokenize("0.6417");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], {
    kind: "number",
    pos: "noun",
    nk: "float",
    text: "0.6417",
  });
});

Deno.test("lex complex number", () => {
  const tokens = tokenize("2e10j1e_2");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], {
    kind: "number",
    pos: "noun",
    nk: "complex",
    text: "2e10j1e_2",
  });
});

Deno.test("lex infinity", () => {
  const tokens = tokenize("_");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], {
    kind: "number",
    pos: "noun",
    nk: "float",
    text: "_",
  });
});

Deno.test("lex extended integer", () => {
  const tokens = tokenize("1x");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], {
    kind: "number",
    pos: "noun",
    nk: "extend",
    text: "1x",
  });
});

Deno.test("lex direct definition with kind", () => {
  const tokens = tokenize("{{)m x + y }}");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0].kind, "direct");
  if (tokens[0].kind === "direct") {
    assertEquals(tokens[0].defKind, "m");
    assertEquals(tokens[0].body, "x + y");
  }
});

Deno.test("lex primitives", () => {
  const tokens = tokenize("+/ y");
  assertEquals(tokens.length, 3);
  assertEquals(tokens[0], { kind: "prim", pos: "verb", text: "+" });
  assertEquals(tokens[1], { kind: "prim", pos: "adv", text: "/" });
  assertEquals(tokens[2], { kind: "name", pos: "name", text: "y" });
});

Deno.test("lex conjunction", () => {
  const tokens = tokenize("9&o.");
  assertEquals(tokens.length, 3);
  assertEquals(tokens[0], {
    kind: "number",
    pos: "noun",
    nk: "integer",
    text: "9",
  });
  assertEquals(tokens[1], { kind: "prim", pos: "conj", text: "&" });
  // o. is a keyword-like but single letter + dot = primitive verb
  assertEquals(tokens[2], { kind: "prim", pos: "verb", text: "o." });
});

Deno.test("lex comment stops tokenizing", () => {
  const tokens = tokenize("x NB. this is a comment");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], { kind: "name", pos: "name", text: "x" });
});

Deno.test("lex control word", () => {
  const tokens = tokenize("if. x do. y end.");
  const keywords = tokens.filter((t) => t.kind === "keyword");
  assertEquals(keywords.length, 3);
});

Deno.test("lex backtick conjunction", () => {
  const tokens = tokenize("f`g");
  assertEquals(tokens.length, 3);
  assertEquals(tokens[1], { kind: "prim", pos: "conj", text: "`" });
});
