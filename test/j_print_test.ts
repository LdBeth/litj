import { assertEquals, assertMatch } from "@std/assert";
import { parseJ } from "../src/j/parser.ts";
import { printJ, printJXml } from "../src/j/print.ts";
import { parse as parseXml } from "@std/xml";
import type { XmlElement } from "../src/xml.ts";
import { children, textOf as _ } from "../src/xml.ts";

// ── Round-trip tests ──────────────────────────────────────────────────────────
// parseJ(printJ(parseJ(src))) must equal parseJ(src)

function roundTrip(src: string) {
  const ast = parseJ(src);
  const reprinted = printJ(ast);
  assertEquals(parseJ(reprinted), ast, `round-trip failed for: ${src}`);
}

function xmlDoc(src: string): XmlElement {
  return parseXml(printJXml(parseJ(src))).root!;
}

Deno.test("round-trip: adverb derivation", () => roundTrip("+/"));
Deno.test("round-trip: conjunction derivation", () => roundTrip("9&o."));
Deno.test("round-trip: hook", () => roundTrip("+-"));
Deno.test("round-trip: fork", () => roundTrip("+*-"));
Deno.test("round-trip: fork with noun tine", () => roundTrip("1+*"));
Deno.test("round-trip: dyad", () => roundTrip("1+2"));
Deno.test("round-trip: monad", () => roundTrip("-1"));
Deno.test("round-trip: nested monad", () => roundTrip("+ - 1"));
Deno.test("round-trip: global assign", () => roundTrip("f=:+/"));
Deno.test("round-trip: local assign", () => roundTrip("f=.+-"));
Deno.test("round-trip: complex expression", () => {
  roundTrip("zsin =: 9&o.(((6:o.])*1:o.[)j.(5:o.])*2:o.[)11&o.");
});

// ── Plain J spot checks ───────────────────────────────────────────────────────

Deno.test("printJ: primitive", () => {
  assertEquals(printJ(parseJ("+")), "+");
});

Deno.test("printJ: adverb", () => {
  assertEquals(printJ(parseJ("+/")), "+/");
});

Deno.test("printJ: conjunction", () => {
  assertEquals(printJ(parseJ("9&o.")), "9&o.");
});

Deno.test("printJ: hook adds parens for nested hook", () => {
  // hook(hook(+,-), *) must become (+ -) *
  const ast = parseJ("(+-)  *");
  const printed = printJ(ast);
  assertEquals(parseJ(printed), ast);
  assertMatch(printed, /\(.*\)/); // nested hook wrapped
});

Deno.test("printJ: string literal", () => {
  // Strings round-trip through the lexer; just confirm no crash
  const ast = parseJ("'hello'");
  const s = printJ(ast);
  assertEquals(s, "'hello'");
});

// ── XML spot checks ───────────────────────────────────────────────────────────

Deno.test("XML num", () => {
  const root = xmlDoc("42");
  const num = children(root, "num")[0];
  assertEquals(num.attributes["pos"], "noun");
  assertEquals(num.attributes["nk"], "integer");
  assertEquals(_(num), "42");
});

Deno.test("XML arr", () => {
  const root = xmlDoc("1 2 3");
  const arr = children(root, "arr")[0];
  assertEquals(arr.attributes["pos"], "noun");
  assertEquals(_(arr), "1 2 3");
});

Deno.test("XML str", () => {
  const root = xmlDoc("'hello'");
  const str = children(root, "str")[0];
  assertEquals(str.attributes["pos"], "noun");
  assertEquals(_(str), "'hello'");
});

Deno.test("XML name", () => {
  const root = xmlDoc("abc");
  const name = children(root, "name")[0];
  assertEquals(_(name), "abc");
});

Deno.test("XML prim", () => {
  const root = xmlDoc("+");
  const prim = children(root, "prim")[0];
  assertEquals(prim.attributes["pos"], "verb");
  assertEquals(_(prim), "+");
});

Deno.test("XML adverb", () => {
  const root = xmlDoc("+/");
  const adv = children(root, "adv")[0];
  assertEquals(adv.attributes["pos"], "verb");
  const [verb, advOp] = children(adv);
  assertEquals(verb.name.local, "prim");
  assertEquals(advOp.name.local, "prim");
});

Deno.test("XML conj", () => {
  const root = xmlDoc("9&o.");
  const conj = children(root, "conj")[0];
  assertEquals(conj.attributes["pos"], "verb");
  const [left, con, right] = children(conj);
  assertEquals(left.name.local, "num");
  assertEquals(con.name.local, "prim");
  assertEquals(right.name.local, "prim");
});

Deno.test("XML monad", () => {
  const root = xmlDoc("-1");
  const monad = children(root, "monad")[0];
  assertEquals(monad.attributes["pos"], "noun");
  const [verb, arg] = children(monad);
  assertEquals(verb.name.local, "prim");
  assertEquals(arg.name.local, "num");
});

Deno.test("XML dyad", () => {
  const root = xmlDoc("1+2");
  const dyad = children(root, "dyad")[0];
  assertEquals(dyad.attributes["pos"], "noun");
  const [verb, left, right] = children(dyad);
  assertEquals(verb.name.local, "prim");
  assertEquals(left.name.local, "num");
  assertEquals(right.name.local, "num");
});

Deno.test("XML hook", () => {
  const root = xmlDoc("+-");
  const hook = children(root, "hook")[0];
  assertEquals(hook.attributes["pos"], "verb");
  const [f, g] = children(hook);
  assertEquals(f.name.local, "prim");
  assertEquals(g.name.local, "prim");
});

Deno.test("XML fork", () => {
  const root = xmlDoc("+*-");
  const fork = children(root, "fork")[0];
  assertEquals(fork.attributes["pos"], "verb");
  const [f, g, h] = children(fork);
  assertEquals(f.name.local, "prim");
  assertEquals(g.name.local, "prim");
  assertEquals(h.name.local, "prim");
});

Deno.test("XML assign", () => {
  const root = xmlDoc("f=:+/");
  const assign = children(root, "assign")[0];
  assertEquals(assign.attributes["pos"], "verb");
  // children: text("f"), text("=:"), nodeToXml(expr)
  const nested = children(assign);
  assertEquals(nested.length, 1); // only the expr is an element
  assertEquals(nested[0].name.local, "adv");
});
