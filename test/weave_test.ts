import { assertEquals } from "@std/assert";
import { parse as parseXml } from "@std/xml";
import { children, textOf } from "../src/xml.ts";
import type { XmlElement, XmlTextNode } from "../src/xml.ts";
import { parse } from "../src/parser.ts";
import { weave } from "../src/weave.ts";

// ── XML helpers ──────────────────────────────────────────────────────────────

function xmlDoc(src: string, variant: string): XmlElement {
  return parseXml(weave(parse(src), variant)).root!;
}

// ── fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE = `NB.% variants: base < poly

[ 0 : 0
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

// ── tests ────────────────────────────────────────────────────────────────────

Deno.test("weave: produces valid XML structure", () => {
  const root = xmlDoc(SAMPLE, "base");
  assertEquals(root.name.local, "document");
  assertEquals(root.attributes["variant"], "base");
});

Deno.test("weave: variants header present", () => {
  const root = xmlDoc(SAMPLE, "base");
  const variants = children(root, "variants");
  assertEquals(variants.length, 1);
  assertEquals(variants[0].attributes["order"], "base < poly");
  const names = children(variants[0], "variant").map((v) =>
    v.attributes["name"]
  );
  assertEquals(names, ["base", "poly"]);
});

Deno.test("weave: includes prose", () => {
  const root = xmlDoc(SAMPLE, "base");
  const prose = children(root, "prose");
  assertEquals(prose.length, 1);
  assertEquals(textOf(prose[0]), "Documentation about types.");
});

Deno.test("weave: base variant excludes poly chunks", () => {
  const root = xmlDoc(SAMPLE, "base");
  const chunks = children(root, "chunk");
  assertEquals(chunks.every((c) => c.attributes["variant"] !== "poly"), true);
});

Deno.test("weave: poly variant includes both chunks", () => {
  const root = xmlDoc(SAMPLE, "poly");
  const chunks = children(root, "chunk");
  const variants = chunks.map((c) => c.attributes["variant"]);
  assertEquals(variants.includes("base"), true);
  assertEquals(variants.includes("poly"), true);
});

Deno.test("weave: escapes XML entities", () => {
  const src = `NB.% variants: base < ext

[ 0 : 0
Docs with <special> & "chars".
)

NB.% [[base.foo
x =: 1 < 2
NB.% ]]
`;
  const root = xmlDoc(src, "base");
  const prose = children(root, "prose");
  assertEquals(textOf(prose[0]), 'Docs with <special> & "chars".');

  const chunk = children(root, "chunk")[0];
  const code = children(chunk, "code")[0];
  assertEquals(textOf(code), "x =: 1 < 2");
});

Deno.test("weave: refinement steps emitted as <step> elements", () => {
  const src = `NB.% variants: base
NB.% [[base.sieve
NB.% <<
sieve =: {{ naive }}
NB.% :: tacify
sieve =: {{ tacit }}
NB.% :: reflex >>
sieve =: {{ final }}
NB.% ]]
`;
  const root = xmlDoc(src, "base");
  const chunk = children(root, "chunk")[0];
  const steps = children(chunk, "step");
  assertEquals(steps.length, 3);

  assertEquals(steps[0].attributes["reason"], "");
  assertEquals(steps[1].attributes["reason"], "tacify");
  assertEquals(steps[2].attributes["reason"], "reflex");
  assertEquals(steps[2].attributes["final"], "true");

  assertEquals(textOf(children(steps[0], "code")[0]), "sieve =: {{ naive }}");
  assertEquals(textOf(children(steps[2], "code")[0]), "sieve =: {{ final }}");
});

Deno.test("weave: single-step chunk emits <code> directly", () => {
  const src = `NB.% variants: base
NB.% [[base.x
x =: 1
NB.% ]]
`;
  const root = xmlDoc(src, "base");
  const chunk = children(root, "chunk")[0];
  assertEquals(children(chunk, "code").length, 1);
  assertEquals(children(chunk, "step").length, 0);
  assertEquals(textOf(children(chunk, "code")[0]), "x =: 1");
});

Deno.test("weave: overrides attribute present on override chunk", () => {
  const root = xmlDoc(SAMPLE, "poly");
  const chunks = children(root, "chunk");
  const polyChunk = chunks.find((c) => c.attributes["variant"] === "poly")!;
  assertEquals(polyChunk.attributes["overrides"], "base.mkTyVar");
});
