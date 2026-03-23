# Literate J

## What This Is

A literate programming tool for the J programming language, inspired by UHC's
Shuffle. It processes doc-first source files (`.ij`) containing named code
chunks tagged with variant labels. Chunks can override each other across
variants, enabling incremental development of a system across multiple language
variants from a single source.

## Commands

```sh
# CLI usage (deno task shortcuts)
deno task tangle -- --variant <name> <input.ij>
deno task weave -- --variant <name> <input.ij>
```

## Architecture

The pipeline is: **parse** → **resolve variants** → **tangle** or **weave**.

- `src/main.ts` — CLI entry point; parses args with `@std/cli/parse-args`,
  dispatches to tangle or weave.
- `src/types.ts` — AST types: `Document` contains a `VariantOrder` and
  `Section[]` (either `Prose` or `Chunk`). `ResolvedChunk` is the output of
  variant resolution.
- `src/parser.ts` — Line-by-line parser. Recognizes `NB.% variants:` header,
  `NB.% [[variant.name` chunk opens, `NB.% ]]` chunk closes. The `0 : 0` / `)`
  delimiters mark prose blocks. Everything else is throw away.
- `src/variants.ts` — Variant partial order traversal (`isAncestor`,
  `isReachable`) and `resolveChunks`: for each chunk name, selects the most
  specific variant ≤ target, respecting explicit `-variant.name` overrides.
- `src/tangle.ts` — Concatenates resolved chunk bodies into a single `.ijs`
  file.
- `src/weave.ts` — Emits custom XML with `<prose>`, `<chunk>`, and `<variants>`
  elements, filtering to chunks reachable at the target variant.

## Source File Format

Literate source files use `NB.%` (J's comment prefix with `%` markup marker) for
all markup, so the source is also valid J:

```
NB.% variants: base < poly < full    (declares ordering)
NB.% [[base.name                     (opens chunk: variant.chunkname)
NB.% [[poly.name -base.name          (opens chunk that overrides base.name)
NB.% ]]                              (closes chunk)
```

Prose is written using J's `[ 0 : 0` noun definition syntax. The `[ 0 : 0` and
`)` delimiters are stripped during weaving. The leading `[` is required to
distinguish prose blocks from `0 : 0` used in code:

```
[ 0 : 0
This prose text appears in woven output
without the delimiters.
)
```
