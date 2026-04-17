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

Literate source example: [example.ij](example.ij)

## Development

Use deno LSP to query definition and types.

### XML output

New XML-emitting code should follow the `el`/`text` builder pattern in
`src/xml.ts`. The `XmlDeclaration` type workaround (omitting the upstream
`declaration` field) is defined there and re-exported for use in `src/weave.ts`.

## Testing

Tests are in `test/` and cover parser, variants, tangle, and weave
functionality.

`test/j_*.ts` covers the J subsystem: `j_lexer_test.ts` (tokenizer),
`j_parser_test.ts` (parser), `j_print_test.ts` (printer round-trips + XML),
`j_clz.test.ts` (parser against real-world J from the `clz` script).

## Architecture

The pipeline is: **parse** → **resolve variants** → **tangle** or **weave**.

- `src/main.ts` — CLI entry point; parses args with `@std/cli/parse-args`,
  dispatches to tangle or weave.
- `src/types.ts` — AST types.
- `src/parser.ts` — Line-by-line parser. Recognizes `NB.% variants:` header,
  `NB.% [[variant.name` chunk opens, `NB.% ]]` chunk closes, `NB.% <j …
  NB.% >` annotation blocks, and `NB.% << … >>` refinement derivations with
  `NB.% :: reason` separators. The `[ 0 : 0` / `)` delimiters mark prose
  blocks. Chunk bodies are emitted as plain text plus, when annotations are
  present, a `segments: BodySegment[]` array (see `src/types.ts`).
- `src/variants.ts` — Variant partial order traversal (`isAncestor`,
  `isReachable`) and `resolveChunks`: for each chunk name, selects the most
  specific variant ≤ target, respecting explicit `-variant.name` overrides.
- `src/tangle.ts` — Concatenates resolved chunk bodies into a single `.ijs`
  file.
- `src/weave.ts` — Emits custom XML with `<prose>`, `<chunk>`, and `<variants>`
  elements, filtering to chunks reachable at the target variant.
- `src/xml.ts` — Shared XML utilities: `XmlDeclaration`/`XmlDocument` type
  workarounds, `el`/`text` builder helpers, re-exports from `@std/xml`.
- `src/j/` — J language parsing implementation: lexer, parser, and AST for J
  expressions. Used for syntax-aware processing of J code within literate
  sources.
  - `src/j/lexer.ts` The tokenizer.
  - `src/j/parser.ts` The J parser.
  - `src/j/ast.ts` Token/AST type definitions.
  - `src/j/rewrite.ts` AST rewriting tools.
  - `src/j/print.ts` — plain-J printer (`printJ`) and annotated XML serialiser
    (`printJXml`, `nodeToXml`). Schema: `src/j/j-ast.xsd`.
  - `src/j/index.ts` Public module entry point.

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

### J annotation blocks

Inside a chunk, a block bracketed by `NB.% <j` and `NB.% >` marks J code
that should be parsed into an annotated AST (emitted as XML during weave,
per `src/j/j-ast.xsd`). The preceding unannotated code is kept verbatim:

```
NB.% [[n2.naive
(sieve 200)-:p:i.46
NB.% <j
(sieve 200) -: p: i. 46
NB.% >
NB.% ]]
```

### Refinement derivations

A chunk body can be a step-by-step derivation, bracketed by `NB.% <<` and
`>>`, with `NB.% :: reason` marking each rewrite. Only the final step is
tangled; all steps are preserved for weave:

```
NB.% [[poly.Sieve
NB.% <<
sieve=:{{ ... }}
NB.% :: more compact tacit form
sieve=:{{ ... }}
NB.% :: make y argument implicit (reflex: f~ y = y f y) >>
sieve=:{{ ... }}
NB.% ]]
```
