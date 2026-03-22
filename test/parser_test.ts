import { assertEquals, assertThrows } from "@std/assert";
import { parse } from "../src/parser.ts";

const SAMPLE = `NB. variants: base < poly < full

This is documentation about type variables.

NB. [[base.mkTyVar
mkTyVar =: monad define
  Ty_Var y
)
NB. ]]

Polymorphism requires extra info.

NB. [[poly.mkTyVar -base.mkTyVar
mkTyVar =: monad define
  Ty_Var y, TyVarCateg_Plain
)
NB. ]]

NB. [[base.helper
helper =: 3 : 'y + 1'
NB. ]]
`;

Deno.test("parse: variant header", () => {
  const doc = parse(SAMPLE);
  assertEquals(doc.variants.names, ["base", "poly", "full"]);
  assertEquals(doc.variants.successors.get("base"), ["poly", "full"]);
  assertEquals(doc.variants.successors.get("poly"), ["full"]);
  assertEquals(doc.variants.successors.get("full"), []);
});

Deno.test("parse: sections", () => {
  const doc = parse(SAMPLE);
  const chunks = doc.sections.filter((s) => s.kind === "chunk");
  assertEquals(chunks.length, 3);

  const c0 = chunks[0];
  assertEquals(c0.kind, "chunk");
  if (c0.kind === "chunk") {
    assertEquals(c0.variant, "base");
    assertEquals(c0.name, "mkTyVar");
    assertEquals(c0.overrides, []);
  }

  const c1 = chunks[1];
  if (c1.kind === "chunk") {
    assertEquals(c1.variant, "poly");
    assertEquals(c1.name, "mkTyVar");
    assertEquals(c1.overrides, ["base.mkTyVar"]);
  }
});

Deno.test("parse: prose sections", () => {
  const doc = parse(SAMPLE);
  const prose = doc.sections.filter((s) => s.kind === "prose");
  assertEquals(prose.length >= 2, true);
});

Deno.test("parse: unterminated chunk throws", () => {
  const bad = `NB. variants: base < poly
NB. [[base.foo
hello
`;
  assertThrows(() => parse(bad), Error, "Unterminated chunk");
});

Deno.test("parse: missing variant header throws", () => {
  const bad = `NB. [[base.foo
hello
NB. ]]
`;
  assertThrows(() => parse(bad), Error, "Missing variant declaration");
});
