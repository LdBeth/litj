# J Annotation Integration Design

**Date:** 2026-04-10

## Context

The literate programming tool processes `.ij` files and emits XML via the weave
pipeline. Chunk bodies are currently treated as opaque text — the J parser
(`src/j/`) is a complete standalone library but is unused by the literate tool.

The goal is to let authors annotate J expressions within chunk bodies for
syntax-aware documentation. The weave output will embed annotated J AST XML
alongside the plain code, enabling downstream renderers to display structured,
part-of-speech-tagged J.

## New Markup Syntax

Within a non-refinement chunk body, a J annotation block is written:

```j
NB.% <j
foo =: 3 + 4
NB.% >
```

- `NB.% <j` opens the annotation (must be on its own line)
- Lines between the markers are the J expression (may be multi-line)
- `NB.% >` closes the annotation (must be on its own line)

Since `NB.%` is J's comment prefix, annotation lines are valid J comments and
do not affect tangle output. The executable code lives alongside them in the
chunk body as normal J lines.

**Disambiguation from existing markers:**

| Regex | Pattern | Purpose |
|-------|---------|---------|
| `ANNOT_OPEN` | `^NB\.%\s+<j\s*$` | New: open annotation |
| `ANNOT_CLOSE` | `^NB\.%\s+>\s*$` | New: close annotation |
| `REFINE_OPEN` | `^NB\.%\s+<<\s*$` | Existing: open refinement |
| `REFINE_STEP` | `^NB\.%\s+::\s*…` | Existing: refinement step |

No conflicts with any existing marker.

**Constraints:**
- Annotations are only valid in non-refinement chunks. Using `NB.% <j` inside
  a chunk that also has `NB.% <<` is a hard parse error.
- An unterminated annotation (no `NB.% >` before chunk close) is a hard parse
  error.

## Type Changes (`src/types.ts`)

```typescript
export type BodySegment =
  | { kind: "code"; text: string }
  | { kind: "annotation"; expr: string };
```

Added to `Chunk`:
```typescript
/** Structured body for weave. Present only when annotations exist. */
segments?: BodySegment[];
```

`body: string` on `Chunk` is unchanged — it remains the tangle body (code
lines only). `RefinementStep` is unchanged.

## Parser Changes (`src/parser.ts`)

Two new regexes added:
```typescript
const ANNOT_OPEN  = /^NB\.%\s+<j\s*$/;
const ANNOT_CLOSE = /^NB\.%\s+>\s*$/;
```

`ParseMode` chunk state gains an `annot?: string[]` field for collecting
annotation lines (`undefined` = not currently inside an annotation block).

Line processing in chunk mode (new cases, evaluated before the fallthrough):
1. `ANNOT_OPEN` matched and `mode.refinement` is set → throw error
2. `ANNOT_OPEN` matched → set `mode.annot = []`
3. `ANNOT_CLOSE` matched and `mode.annot` is set → close annotation, push
   `{ kind: "annotation", expr: mode.annot.join("\n") }` to a local
   `segments` accumulator; clear `mode.annot`
4. Line when `mode.annot` is set → push to `mode.annot`
5. Line otherwise → push to `mode.lines` and push
   `{ kind: "code", text: line }` to `segments` accumulator

At chunk close: if `segments` accumulator has any `annotation` entry, set
`chunk.segments = segments`. Otherwise leave `segments` undefined (no overhead
for unannotated chunks).

## Weave Changes (`src/weave.ts`)

Import J parser and XML converter:
```typescript
import { nodeToXml, parseJ } from "./j/index.ts";
```

New helper replaces the bare `code(chunk.body)` call for single-step chunks:

```typescript
function codeSegments(chunk: Chunk): XmlElement {
  if (!chunk.segments) return code(chunk.body);
  const children: XmlNode[] = chunk.segments.flatMap((seg) => {
    if (seg.kind === "code") return seg.text ? [text(seg.text)] : [];
    try {
      return [el("annotation", { expr: seg.expr }, [nodeToXml(parseJ(seg.expr))])];
    } catch (e) {
      throw new Error(`J parse failed in chunk "${chunk.name}": ${seg.expr}\n${e}`);
    }
  });
  return el("code", {}, children);
}
```

Parse failures during weave are hard errors. The `<annotation expr="...">` element
preserves the source expression and contains the J AST XML tree as a child.

**Example weave output:**

```xml
<chunk variant="poly" name="example">
  <code>
    <text>foo =: 3 + 4</text>
    <annotation expr="foo =: 3 + 4">
      <assign pos="verb">
        <name pos="verb">foo</name>
        <copula>=:</copula>
        <dyad pos="noun">...</dyad>
      </assign>
    </annotation>
    <text>bar =: foo * 2</text>
  </code>
</chunk>
```

## Tangle Changes

None. Tangle reads `chunk.body` (code lines only) which is unchanged.

## Testing

**`test/parser_test.ts`** — new cases:
- Chunk with annotation sets `segments` with correct interleaved `code`/`annotation` entries
- `body` (tangle string) excludes annotation lines
- Chunk without annotations has `segments` undefined
- Annotation inside refinement chunk throws at parse time
- Unterminated `NB.% <j` throws at parse time

**`test/weave_test.ts`** — new cases:
- Annotated chunk emits `<code>` with `<annotation expr="...">` child containing J AST XML
- J parse failure in weave throws with informative message

Existing tests are unaffected — `body`, `steps`, and all unannotated chunk behavior is unchanged.

## Files Modified

- `src/types.ts` — add `BodySegment` type, add `segments?` to `Chunk`
- `src/parser.ts` — add `ANNOT_OPEN`/`ANNOT_CLOSE` regexes, extend chunk mode
- `src/weave.ts` — add `codeSegments()` helper, import J parser
- `test/parser_test.ts` — new annotation parsing tests
- `test/weave_test.ts` — new annotation weave tests
