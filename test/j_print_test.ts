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

Deno.test("XML adverb", () => {
  const root = xmlDoc("+/");
  const adv = children(root, "adv")[0];
  assertEquals(adv.attributes["pos"], "verb");
});
