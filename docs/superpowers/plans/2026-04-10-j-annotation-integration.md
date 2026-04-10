# J Annotation Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed annotated J AST XML in weave output for chunk bodies that
contain `NB.% <j` / `NB.% >` annotation blocks.

**Architecture:** Add `BodySegment` type and `segments?` to `Chunk`; extend the
parser to recognize annotation markers and build structured segments; update
weave to emit `<annotation>` elements with J AST children. Tangle is untouched.
TDD throughout.

**Tech Stack:** Deno/TypeScript, `@std/assert`, `src/j/index.ts` (parseJ,
nodeToXml)

---

## File Map

- **Modify** `src/types.ts` — add `BodySegment` union type, add `segments?` to
  `Chunk`
- **Modify** `src/parser.ts` — add `ANNOT_OPEN`/`ANNOT_CLOSE` regexes, extend
  chunk mode
- **Modify** `src/weave.ts` — add `codeSegments()` helper, import J parser
- **Modify** `test/parser_test.ts` — new annotation parsing tests
- **Modify** `test/weave_test.ts` — new annotation weave tests

---

### Task 1: Add BodySegment type and segments field to Chunk

**Files:**

- Modify: `src/types.ts`

- [ ] **Step 1: Add BodySegment type and segments field**

In `src/types.ts`, add after the `RefinementStep` interface and before the
`Chunk` interface:

```typescript
/** One segment of a chunk body: plain code or a J annotation to parse. */
export type BodySegment =
  | { kind: "code"; text: string }
  | { kind: "annotation"; expr: string };
```

And add `segments?: BodySegment[];` to the `Chunk` interface after `steps`:

```typescript
export interface Chunk {
  kind: "chunk";
  variant: string;
  name: string;
  overrides: string[];
  body: string;
  steps: RefinementStep[];
  /** Structured body for weave. Present only when at least one annotation exists. */
  segments?: BodySegment[];
}
```

- [ ] **Step 2: Verify types compile**

```bash
deno check src/types.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "types: add BodySegment and Chunk.segments for J annotation"
```

---

### Task 2: Write failing parser tests for annotations

**Files:**

- Modify: `test/parser_test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/parser_test.ts`:

```typescript
// ── J annotation tests ───────────────────────────────────────────────────────

const ANNOT_SAMPLE = `NB.% variants: base
NB.% [[base.foo
x =: 1
NB.% <j
x =: 1
NB.% >
y =: 2
NB.% ]]
`;

Deno.test("parse: annotation sets segments on chunk", () => {
  const doc = parse(ANNOT_SAMPLE);
  const c = doc.sections[0];
  if (c.kind === "chunk") {
    assertEquals(c.segments?.length, 3);
    assertEquals(c.segments?.[0], { kind: "code", text: "x =: 1" });
    assertEquals(c.segments?.[1], { kind: "annotation", expr: "x =: 1" });
    assertEquals(c.segments?.[2], { kind: "code", text: "y =: 2" });
  }
});

Deno.test("parse: annotation excluded from tangle body", () => {
  const doc = parse(ANNOT_SAMPLE);
  const c = doc.sections[0];
  if (c.kind === "chunk") {
    assertEquals(c.body, "x =: 1\ny =: 2");
  }
});

Deno.test("parse: chunk without annotation has undefined segments", () => {
  const src = `NB.% variants: base
NB.% [[base.x
x =: 1
NB.% ]]
`;
  const doc = parse(src);
  const c = doc.sections[0];
  if (c.kind === "chunk") {
    assertEquals(c.segments, undefined);
  }
});

Deno.test("parse: annotation inside refinement throws", () => {
  const bad = `NB.% variants: base
NB.% [[base.sieve
NB.% <<
sieve =: naive
NB.% <j
sieve =: naive
NB.% >
NB.% :: refine >>
sieve =: final
NB.% ]]
`;
  assertThrows(
    () => parse(bad),
    Error,
    "J annotation not allowed inside refinement",
  );
});

Deno.test("parse: unterminated annotation throws", () => {
  const bad = `NB.% variants: base
NB.% [[base.foo
x =: 1
NB.% <j
x =: 1
NB.% ]]
`;
  assertThrows(() => parse(bad), Error, "Unterminated NB.% <j");
});

Deno.test("parse: multi-line annotation expression", () => {
  const src = `NB.% variants: base
NB.% [[base.foo
NB.% <j
line1
line2
NB.% >
NB.% ]]
`;
  const doc = parse(src);
  const c = doc.sections[0];
  if (c.kind === "chunk") {
    assertEquals(c.segments?.[0], { kind: "annotation", expr: "line1\nline2" });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
deno test test/parser_test.ts
```

Expected: new tests FAIL (annotation-related), existing tests PASS.

---

### Task 3: Implement annotation parsing in parser.ts

**Files:**

- Modify: `src/parser.ts`

- [ ] **Step 1: Import BodySegment and add new regexes**

In `src/parser.ts`, update the import from `./types.ts`:

```typescript
import type {
  BodySegment,
  Chunk,
  Document,
  Prose,
  RefinementStep,
  Section,
  VariantOrder,
} from "./types.ts";
```

Add two new regexes after the existing `REFINE_STEP` line:

```typescript
const ANNOT_OPEN = /^NB\.%\s+<j\s*$/;
const ANNOT_CLOSE = /^NB\.%\s+>\s*$/;
```

- [ ] **Step 2: Extend ParseMode chunk state**

Replace the existing `ParseMode` type with:

```typescript
type ParseMode =
  | { tag: "top" }
  | { tag: "jdef" }
  | {
    tag: "chunk";
    header: ChunkHeader;
    lines: string[];
    segments: BodySegment[];
    annot?: string[];
    refinement?: RefinementStep[];
  };
```

- [ ] **Step 3: Initialize segments in chunk mode entry**

In the `top` case, where `mode` is set to chunk, add `segments: []`:

```typescript
mode = {
  tag: "chunk",
  header: parseChunkHeader(chunkMatch[1]),
  lines: [],
  segments: [],
};
```

- [ ] **Step 4: Implement annotation handling in chunk case**

Replace the full `case "chunk":` block with:

```typescript
case "chunk": {
  if (CHUNK_CLOSE.test(line)) {
    if (mode.annot !== undefined) {
      throw new Error(
        `Unterminated NB.% <j annotation in chunk "${mode.header.variant}.${mode.header.name}"`,
      );
    }
    let steps: RefinementStep[];
    if (mode.refinement) {
      flushStepLines(mode.refinement, mode.lines);
      steps = mode.refinement;
    } else {
      const hasAnnotations = mode.segments.some((s) => s.kind === "annotation");
      let body: string;
      if (hasAnnotations) {
        if (mode.lines.length > 0) {
          mode.segments.push({ kind: "code", text: mode.lines.join("\n") });
        }
        body = mode.segments
          .filter((s): s is Extract<BodySegment, { kind: "code" }> =>
            s.kind === "code"
          )
          .map((s) => s.text)
          .filter((t) => t.length > 0)
          .join("\n");
      } else {
        body = mode.lines.join("\n");
      }
      steps = [{ reason: "", isFinal: false, body }];
    }
    sections.push(<Chunk> {
      kind: "chunk",
      ...mode.header,
      body: steps[steps.length - 1].body,
      steps,
      segments: mode.segments.some((s) => s.kind === "annotation")
        ? mode.segments
        : undefined,
    });
    mode = { tag: "top" };
  } else if (mode.annot !== undefined) {
    if (ANNOT_CLOSE.test(line)) {
      mode.segments.push({ kind: "annotation", expr: mode.annot.join("\n") });
      mode.annot = undefined;
    } else {
      mode.annot.push(line);
    }
  } else if (ANNOT_OPEN.test(line)) {
    if (mode.refinement) {
      throw new Error(
        `J annotation not allowed inside refinement in chunk "${mode.header.variant}.${mode.header.name}"`,
      );
    }
    if (mode.lines.length > 0) {
      mode.segments.push({ kind: "code", text: mode.lines.join("\n") });
      mode.lines = [];
    }
    mode.annot = [];
  } else if (!mode.refinement && REFINE_OPEN.test(line)) {
    mode.refinement = [{ reason: "", isFinal: false, body: "" }];
    mode.lines = [];
  } else if (mode.refinement && REFINE_STEP.test(line)) {
    const m = line.match(REFINE_STEP)!;
    flushStepLines(mode.refinement, mode.lines);
    mode.lines = [];
    mode.refinement.push({
      reason: m[1].trim(),
      isFinal: m[2] !== undefined,
      body: "",
    });
  } else {
    mode.lines.push(line);
  }
  break;
}
```

- [ ] **Step 5: Run parser tests**

```bash
deno test test/parser_test.ts
```

Expected: ALL tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/parser.ts src/types.ts
git commit -m "parser: recognize NB.% <j / NB.% > annotation blocks"
```

---

### Task 4: Write failing weave tests for annotation output

**Files:**

- Modify: `test/weave_test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/weave_test.ts`:

```typescript
// ── J annotation tests ───────────────────────────────────────────────────────

Deno.test("weave: annotation block emits <annotation> with J AST", () => {
  const src = `NB.% variants: base
NB.% [[base.foo
x =: 1
NB.% <j
x =: 1
NB.% >
y =: 2
NB.% ]]
`;
  const root = xmlDoc(src, "base");
  const chunk = children(root, "chunk")[0];
  const code = children(chunk, "code")[0];

  // Text nodes: "x =: 1" and "y =: 2" are direct text children
  const annotations = children(code, "annotation");
  assertEquals(annotations.length, 1);
  assertEquals(annotations[0].attributes["expr"], "x =: 1");

  // The annotation contains a J AST root element (assign node)
  const jAst = children(annotations[0]);
  assertEquals(jAst.length, 1);
  assertEquals(jAst[0].name.local, "assign");
});

Deno.test("weave: unannotated chunk unaffected", () => {
  const src = `NB.% variants: base
NB.% [[base.x
x =: 1
NB.% ]]
`;
  const root = xmlDoc(src, "base");
  const chunk = children(root, "chunk")[0];
  const code = children(chunk, "code")[0];
  assertEquals(children(code, "annotation").length, 0);
  assertEquals(textOf(code), "x =: 1");
});

Deno.test("weave: annotation parse failure throws", () => {
  // Inject a pre-parsed chunk with an invalid J expr by testing codeSegments directly
  // by parsing a chunk whose annotation expr is syntactically invalid J
  // We test via a simpler approach: use a known-bad expression
  const src = `NB.% variants: base
NB.% [[base.bad
NB.% <j
=: broken syntax @@@
NB.% >
NB.% ]]
`;
  assertThrows(
    () => weave(parse(src), "base"),
    Error,
  );
});
```

Add `assertThrows` to the import at the top of `test/weave_test.ts`:

```typescript
import { assertEquals, assertThrows } from "@std/assert";
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
deno test test/weave_test.ts
```

Expected: new annotation tests FAIL, existing tests PASS.

---

### Task 5: Implement annotation emission in weave.ts

**Files:**

- Modify: `src/weave.ts`

- [ ] **Step 1: Add imports**

In `src/weave.ts`, update imports:

```typescript
import type {
  XmlDeclaration,
  XmlDocument,
  XmlElement,
  XmlNode,
} from "./xml.ts";
import { el, stringify, text } from "./xml.ts";

import type { Chunk, Document } from "./types.ts";
import { isReachable } from "./variants.ts";
import { nodeToXml, parseJ } from "./j/index.ts";
```

- [ ] **Step 2: Add codeSegments helper**

Add after the existing `code()` helper function:

```typescript
function codeSegments(chunk: Chunk): XmlElement {
  if (!chunk.segments) return code(chunk.body);
  const children: XmlNode[] = chunk.segments.flatMap((seg) => {
    if (seg.kind === "code") return seg.text ? [text(seg.text)] : [];
    try {
      return [
        el("annotation", { expr: seg.expr }, [nodeToXml(parseJ(seg.expr))]),
      ];
    } catch (e) {
      throw new Error(
        `J parse failed in chunk "${chunk.name}": ${seg.expr}\n${e}`,
      );
    }
  });
  return el("code", {}, children);
}
```

- [ ] **Step 3: Use codeSegments in weave**

In the `weave` function, replace:

```typescript
const body: XmlNode[] = chunk.steps.length > 1
  ? chunk.steps.map((step) =>
    el("step", {
      reason: step.reason,
      final: step.isFinal ? "true" : undefined,
    }, [code(step.body)])
  )
  : [code(chunk.body)];
```

with:

```typescript
const body: XmlNode[] = chunk.steps.length > 1
  ? chunk.steps.map((step) =>
    el("step", {
      reason: step.reason,
      final: step.isFinal ? "true" : undefined,
    }, [code(step.body)])
  )
  : [codeSegments(chunk)];
```

- [ ] **Step 4: Run all tests**

```bash
deno test
```

Expected: ALL tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/weave.ts test/parser_test.ts test/weave_test.ts
git commit -m "weave: emit annotated J AST XML for NB.% <j annotation blocks"
```

---

### Task 6: Save plan doc and verify

- [ ] **Step 1: Save plan to docs**

```bash
mkdir -p docs/superpowers/plans
cp /dev/stdin docs/superpowers/plans/2026-04-10-j-annotation-integration.md << 'EOF'
(copy content of this plan file)
EOF
```

Actually, the plan file is at
`/Users/ldbeth/.claude/plans/lucky-singing-comet.md` — copy it:

```bash
cp /Users/ldbeth/.claude/plans/lucky-singing-comet.md \
   docs/superpowers/plans/2026-04-10-j-annotation-integration.md
```

- [ ] **Step 2: Final test run**

```bash
deno test
```

Expected: ALL tests PASS.

- [ ] **Step 3: Commit docs**

```bash
git add docs/
git commit -m "docs: add J annotation integration plan and spec"
```
