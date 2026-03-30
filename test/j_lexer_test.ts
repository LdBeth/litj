import { assertEquals } from "@std/assert";
import { tokenize } from "../src/j/lexer.ts";

Deno.test("lex simple assignment", () => {
  const tokens = tokenize("x=.3");
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
    kind: "prim",
    pos: "noun",
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
  const tokens = tokenize("{{)m: x + y }}");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0].kind, "direct");
  if (tokens[0].kind === "direct") {
    assertEquals(tokens[0].defKind, "m");
    assertEquals(tokens[0].body, [
      { kind: "name", pos: "name", text: "x" },
      { kind: "prim", pos: "verb", text: "+" },
      { kind: "name", pos: "name", text: "y" },
    ]);
  }
});

Deno.test("lex direct definition without kind", () => {
  const tokens = tokenize("{{ 1 + 2 }}");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0].kind, "direct");
  if (tokens[0].kind === "direct") {
    assertEquals(tokens[0].defKind, null);
    assertEquals(tokens[0].body, [
      { kind: "number", pos: "noun", nk: "integer", text: "1" },
      { kind: "prim", pos: "verb", text: "+" },
      { kind: "number", pos: "noun", nk: "integer", text: "2" },
    ]);
  }
});

Deno.test("lex noun direct definition", () => {
  const tokens = tokenize("{{)n12321}}");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], {
    kind: "direct_noun",
    pos: "noun",
    body: "12321",
  });
});

Deno.test("lex noun direct definition with colon", () => {
  const tokens = tokenize("{{)n: hello}}");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], {
    kind: "direct_noun",
    pos: "noun",
    body: ": hello",
  });
});

Deno.test("direct definition without colon is error", () => {
  const tokens = tokenize("{{)m x + y}}");
  assertEquals(tokens.some((t) => t.kind === "error"), true);
});

Deno.test("unclosed string is error", () => {
  const tokens = tokenize("'''");
  assertEquals(tokens.some((t) => t.kind === "error"), true);
});

Deno.test("unclosed direct definition is error", () => {
  const tokens = tokenize("{{)n: 1+2");
  assertEquals(tokens.some((t) => t.kind === "error"), true);
});

Deno.test("lex primitives", () => {
  const tokens = tokenize("+./y");
  assertEquals(tokens.length, 3);
  assertEquals(tokens[0], { kind: "prim", pos: "verb", text: "+." });
  assertEquals(tokens[1], { kind: "prim", pos: "adv", text: "/" });
  assertEquals(tokens[2], { kind: "name", pos: "name", text: "y" });
});

Deno.test("lex verb", () => {
  const tokens = tokenize("0:");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], {
    kind: "prim",
    pos: "verb",
    text: "0:",
  });
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

// ── Core tokenization: dot/colon suffix consumed as part of token ──────────

Deno.test("graphic + trailing dots/colons is one token", () => {
  // J's ;: confirms: +.:.:: is ONE token
  const tokens = tokenize("+.:.:: y");
  assertEquals(tokens.length, 2);
  assertEquals(tokens[0], { kind: "unknown", pos: "mark", text: "+.:.::" });
});

Deno.test("/.. is one token", () => {
  // /. is a known adverb, but /.. is not — one unknown token
  const tokens = tokenize("/..y");
  assertEquals(tokens.length, 2);
  assertEquals(tokens[0], { kind: "prim", pos: "adv", text: "/.." });
});

Deno.test("alpha + trailing dots/colons is one token", () => {
  const tokens = tokenize("a:::.....::y");
  assertEquals(tokens.length, 2);
  assertEquals(tokens[0], {
    kind: "unknown",
    pos: "mark",
    text: "a:::.....::",
  });
});

Deno.test("multi-letter alpha + dot/colon suffix is one token", () => {
  const tokens = tokenize("abc.: y");
  assertEquals(tokens.length, 2);
  assertEquals(tokens[0], { kind: "unknown", pos: "mark", text: "abc.:" });
});

Deno.test("= with extra trailing dots is one unknown token", () => {
  // =. and =: are copulas, but =.. is not — one unknown token
  const tokens = tokenize("=..");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], { kind: "unknown", pos: "mark", text: "=.." });
});

Deno.test("dot-start token consumes trailing dots/colons", () => {
  const tokens = tokenize(".:.y");
  assertEquals(tokens.length, 2);
  assertEquals(tokens[0], { kind: "unknown", pos: "mark", text: ".:." });
});

Deno.test("digit-start token with dot/colon suffix", () => {
  // 3:. is one token under rule 3 (digit, then trailing :.)
  const tokens = tokenize("3:.");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], { kind: "unknown", pos: "mark", text: "3:." });
});

Deno.test("underscore-start with dot/colon suffix", () => {
  const tokens = tokenize("_.:y");
  assertEquals(tokens.length, 2);
  assertEquals(tokens[0], { kind: "unknown", pos: "mark", text: "_.:" });
});

Deno.test("for_abc. is a keyword", () => {
  const tokens = tokenize("for_abc. do. end.");
  const keywords = tokens.filter((t) => t.kind === "keyword");
  assertEquals(keywords.length, 3);
  assertEquals(keywords[0], { kind: "keyword", pos: "mark", text: "for_abc." });
});

Deno.test("digit-start with alpha body is one token", () => {
  // 12abc is one token under rule 3
  const tokens = tokenize("12abc");
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], { kind: "unknown", pos: "mark", text: "12abc" });
});
