# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A literate programming tool for the J programming language, inspired by UHC's Shuffle. It processes doc-first source files (`.ij`) containing named code chunks tagged with variant labels. Chunks can override each other across variants, enabling incremental development of a system across multiple language variants from a single source.

## Commands

```sh
deno test --allow-read            # run all tests
deno test --allow-read test/parser_test.ts  # run a single test file

# CLI usage
deno run --allow-read src/main.ts tangle --variant <name> <input.ij>
deno run --allow-read --allow-write src/main.ts tangle --variant <name> -o out.ijs <input.ij>
deno run --allow-read src/main.ts weave --variant <name> <input.ij>
```

## Architecture

The pipeline is: **parse** → **resolve variants** → **tangle** or **weave**.

- `src/types.ts` — AST types: `Document` contains a `VariantOrder` and `Section[]` (either `Prose` or `Chunk`). `ResolvedChunk` is the output of variant resolution.
- `src/parser.ts` — Line-by-line parser. Recognizes `NB. variants:` header, `NB. [[variant.name` chunk opens, `NB. ]]` chunk closes. Everything else is prose.
- `src/variants.ts` — Variant partial order traversal (`isAncestor`, `isReachable`) and `resolveChunks`: for each chunk name, selects the most specific variant ≤ target, respecting explicit `-variant.name` overrides.
- `src/tangle.ts` — Concatenates resolved chunk bodies into a single `.ijs` file.
- `src/weave.ts` — Emits custom XML with `<prose>`, `<chunk>`, and `<variants>` elements, filtering to chunks reachable at the target variant.

## Source File Format

Literate source files use `NB.` (J's comment prefix) for all markup, so the source is also valid J:

```
NB. variants: base < poly < full    (declares ordering)
NB. [[base.name                     (opens chunk: variant.chunkname)
NB. [[poly.name -base.name          (opens chunk that overrides base.name)
NB. ]]                              (closes chunk)
```

Chunks are emitted as named J definitions (not textual substitution). Each file is self-contained.
