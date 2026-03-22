import { assertEquals } from "@std/assert";
import { parse } from "../src/parser.ts";
import { isAncestor, isReachable, resolveChunks } from "../src/variants.ts";

const SAMPLE = `NB. variants: base < poly < full

NB. [[base.mkTyVar
mkTyVar =: monad define
  Ty_Var y
)
NB. ]]

NB. [[poly.mkTyVar -base.mkTyVar
mkTyVar =: monad define
  Ty_Var y, TyVarCateg_Plain
)
NB. ]]

NB. [[base.helper
helper =: 3 : 'y + 1'
NB. ]]
`;

Deno.test("isAncestor: base < poly", () => {
  const doc = parse(SAMPLE);
  assertEquals(isAncestor(doc.variants, "base", "poly"), true);
});

Deno.test("isAncestor: base < full (transitive)", () => {
  const doc = parse(SAMPLE);
  assertEquals(isAncestor(doc.variants, "base", "full"), true);
});

Deno.test("isAncestor: poly not < base", () => {
  const doc = parse(SAMPLE);
  assertEquals(isAncestor(doc.variants, "poly", "base"), false);
});

Deno.test("isReachable: base at poly", () => {
  const doc = parse(SAMPLE);
  assertEquals(isReachable(doc.variants, "base", "poly"), true);
});

Deno.test("isReachable: poly at base is false", () => {
  const doc = parse(SAMPLE);
  assertEquals(isReachable(doc.variants, "poly", "base"), false);
});

Deno.test("resolveChunks: target=base gets only base chunks", () => {
  const doc = parse(SAMPLE);
  const resolved = resolveChunks(doc, "base");
  assertEquals(resolved.length, 2);
  assertEquals(resolved[0].name, "mkTyVar");
  assertEquals(resolved[0].variant, "base");
  assertEquals(resolved[1].name, "helper");
});

Deno.test("resolveChunks: target=poly overrides base.mkTyVar", () => {
  const doc = parse(SAMPLE);
  const resolved = resolveChunks(doc, "poly");
  const mkTyVar = resolved.find((c) => c.name === "mkTyVar")!;
  assertEquals(mkTyVar.variant, "poly");
  assertEquals(mkTyVar.body.includes("TyVarCateg_Plain"), true);
  // helper should still be present from base
  const helper = resolved.find((c) => c.name === "helper")!;
  assertEquals(helper.variant, "base");
});

Deno.test("resolveChunks: preserves source order", () => {
  const doc = parse(SAMPLE);
  const resolved = resolveChunks(doc, "poly");
  assertEquals(resolved[0].name, "mkTyVar");
  assertEquals(resolved[1].name, "helper");
});
