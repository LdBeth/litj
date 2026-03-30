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

# Run tests
deno test
```

See [example.ij](example.ij) for a working literate source example.

## Development

Use deno LSP to query definition and types.

### Workflow for J Lexer/Parser Changes

`plan.md` contains the task spec. Follow its workflow: amend types and tests
first, ask for approval, then implement. Changing `src/j/ast.ts` Token type will
break `src/j/parser.ts` — update both.

## Testing

Tests are in `test/` and cover parser, variants, tangle, and weave
functionality.

`test/j_lexer_test.ts` tests the J tokenizer. `test/j_parser_test.ts` tests the
J parser.

## Architecture

The pipeline is: **parse** → **resolve variants** → **tangle** or **weave**.

- `src/main.ts` — CLI entry point; parses args with `@std/cli/parse-args`,
  dispatches to tangle or weave.
- `src/types.ts` — AST types.
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
- `src/j/` — J language parsing implementation: lexer, parser, and AST for J
  expressions. Used for syntax-aware processing of J code within literate
  sources.
  - `src/j/lexer.ts` The tokenizer.
  - `src/j/parser.ts` The J parser.

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
