import type {
  BodySegment,
  Chunk,
  Document,
  Prose,
  RefinementStep,
  Section,
  VariantOrder,
} from "./types.ts";

type ChunkHeader = Pick<Chunk, "variant" | "name" | "overrides">;

const VARIANT_HEADER = /^NB\.%\s+variants:\s*(.+)$/;
const CHUNK_OPEN = /^NB\.%\s+\[\[(.+)$/;
const CHUNK_CLOSE = /^NB\.%\s+\]\]\s*$/;
const REFINE_OPEN = /^NB\.%\s+<<\s*$/;
const REFINE_STEP = /^NB\.%\s+::\s*(.*?)(\s+>>)?\s*$/;
const ANNOT_OPEN  = /^NB\.%\s+<j\s*$/;
const ANNOT_CLOSE = /^NB\.%\s+>\s*$/;
const JDEF_OPEN = /^\[\s*0\s+:\s*0\s*$/;
const JDEF_CLOSE = /^\)\s*$/;

/** Parse a variant ordering declaration like "base < poly < full". */
function parseVariantOrder(decl: string): VariantOrder {
  const names = decl.split("<").map((s) => s.trim()).filter((s) =>
    s.length > 0
  );
  const successors = new Map(
    names.map((name, i) => [name, names.slice(i + 1)]),
  );
  return { names, successors };
}

/**
 * Parse a chunk header like "poly.mkTyVar -base.mkTyVar".
 * Returns { variant, name, overrides }.
 */
function parseChunkHeader(header: string): ChunkHeader {
  const parts = header.trim().split(/\s+/);
  const primary = parts[0];
  const dot = primary.indexOf(".");
  if (dot === -1) {
    throw new Error(
      `Invalid chunk header: "${header}" (expected variant.name)`,
    );
  }
  const variant = primary.slice(0, dot);
  const name = primary.slice(dot + 1);

  const overrides = parts.slice(1).filter((p) => p.startsWith("-")).map((p) =>
    p.slice(1)
  );

  return { variant, name, overrides };
}

/** Parser mode: sum type replacing 3 booleans + nullable chunk header. */
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

/** Flush accumulated lines into the last refinement step. */
function flushStepLines(steps: RefinementStep[], lines: string[]) {
  steps[steps.length - 1].body = lines.join("\n");
}

/** Parse a literate J source file. */
export function parse(source: string): Document {
  const lines = source.split("\n");
  let variants: VariantOrder | null = null;
  const sections: Section[] = [];
  let proseLines: string[] = [];
  let mode: ParseMode = { tag: "top" };

  function flushProse() {
    const text = proseLines.join("\n");
    if (text.trim().length > 0) {
      sections.push(<Prose> { kind: "prose", text });
    }
    proseLines = [];
  }

  for (const line of lines) {
    switch (mode.tag) {
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
            mode.segments.push({ kind: "annotation", text: mode.annot.join("\n") });
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
      case "jdef": {
        if (JDEF_CLOSE.test(line)) {
          flushProse();
          mode = { tag: "top" };
        } else {
          proseLines.push(line);
        }
        break;
      }
      case "top": {
        const variantMatch = line.match(VARIANT_HEADER);
        if (variantMatch) {
          flushProse();
          variants = parseVariantOrder(variantMatch[1]);
        } else {
          const chunkMatch = line.match(CHUNK_OPEN);
          if (chunkMatch) {
            flushProse();
            mode = {
              tag: "chunk",
              header: parseChunkHeader(chunkMatch[1]),
              lines: [],
              segments: [],
            };
          } else if (JDEF_OPEN.test(line)) {
            mode = { tag: "jdef" };
          }
        }
        break;
      }
    }
  }

  if (mode.tag === "chunk") {
    throw new Error("Unterminated chunk at end of file");
  }
  if (mode.tag === "jdef") {
    throw new Error("Unterminated 0 : 0 block at end of file");
  }
  if (!variants) {
    throw new Error("Missing variant declaration (NB.% variants: ...)");
  }

  return { variants, sections };
}
