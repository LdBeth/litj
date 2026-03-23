import { assertEquals } from "@std/assert";
import { parse } from "../src/parser.ts";
import { weave } from "../src/weave.ts";

const SAMPLE = `NB.% variants: base < poly

0 : 0
Documentation about types.
)

NB.% [[base.mkTyVar
mkTyVar =: monad define
  Ty_Var y
)
NB.% ]]

NB.% [[poly.mkTyVar -base.mkTyVar
mkTyVar =: monad define
  Ty_Var y, TyVarCateg_Plain
)
NB.% ]]
`;

Deno.test("weave: produces valid XML structure", () => {
  const doc = parse(SAMPLE);
  const xml = weave(doc, "base");
  assertEquals(xml.startsWith('<?xml version="1.0"'), true);
  assertEquals(xml.includes('<document variant="base">'), true);
  assertEquals(xml.includes("</document>"), true);
});

Deno.test("weave: includes prose", () => {
  const doc = parse(SAMPLE);
  const xml = weave(doc, "base");
  assertEquals(xml.includes("<prose>"), true);
  assertEquals(xml.includes("Documentation about types."), true);
});

Deno.test("weave: base variant excludes poly chunks", () => {
  const doc = parse(SAMPLE);
  const xml = weave(doc, "base");
  assertEquals(xml.includes('variant="poly"'), false);
});

Deno.test("weave: poly variant includes both chunks", () => {
  const doc = parse(SAMPLE);
  const xml = weave(doc, "poly");
  assertEquals(xml.includes('variant="base"'), true);
  assertEquals(xml.includes('variant="poly"'), true);
});

Deno.test("weave: escapes XML entities", () => {
  const src = `NB.% variants: base < ext

0 : 0
Docs with <special> & "chars".
)

NB.% [[base.foo
x =: 1 < 2
NB.% ]]
`;
  const doc = parse(src);
  const xml = weave(doc, "base");
  assertEquals(xml.includes("&lt;special&gt;"), true);
  assertEquals(xml.includes("&amp;"), true);
});
