import { assertEquals } from "@std/assert";
import { parse } from "../src/parser.ts";
import { resolveChunks } from "../src/variants.ts";
import { tangle } from "../src/tangle.ts";

const SAMPLE = `NB.% variants: base < poly

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

NB.% [[base.helper
helper =: 3 : 'y + 1'
NB.% ]]
`;

Deno.test("tangle: base variant", () => {
  const doc = parse(SAMPLE);
  const resolved = resolveChunks(doc, "base");
  const output = tangle(resolved);
  assertEquals(output.includes("Ty_Var y"), true);
  assertEquals(output.includes("TyVarCateg_Plain"), false);
  assertEquals(output.includes("helper"), true);
});

Deno.test("tangle: poly variant", () => {
  const doc = parse(SAMPLE);
  const resolved = resolveChunks(doc, "poly");
  const output = tangle(resolved);
  assertEquals(output.includes("TyVarCateg_Plain"), true);
  assertEquals(output.includes("helper"), true);
});

Deno.test("tangle: refinement chunk emits last step body", () => {
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
  const doc = parse(src);
  const resolved = resolveChunks(doc, "base");
  const output = tangle(resolved);
  assertEquals(output, "sieve =: {{ final }}");
});

Deno.test("tangle: empty chunk body", () => {
  const src = `NB.% variants: base
NB.% [[base.empty
NB.% ]]
`;
  const doc = parse(src);
  const resolved = resolveChunks(doc, "base");
  const output = tangle(resolved);
  assertEquals(output, "");
});
