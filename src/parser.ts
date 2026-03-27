import type {
  Document,
  Prose,
  RefinementStep,
  Section,
  VariantOrder,
} from "./types.ts";

const VARIANT_HEADER = /^NB\.%\s+variants:\s*(.+)$/;
const CHUNK_OPEN = /^NB\.%\s+\[\[(.+)$/;
const CHUNK_CLOSE = /^NB\.%\s+\]\]\s*$/;
const REFINE_OPEN = /^NB\.%\s+<<\s*$/;
const REFINE_STEP = /^NB\.%\s+::\s*(.*?)(\s+>>)?\s*$/;
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
function parseChunkHeader(header: string): {
  variant: string;
  name: string;
  overrides: string[];
} {
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
    variant: string;
    name: string;
    overrides: string[];
    lines: string[];
    refinement: RefinementStep[] | null;
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
          let steps: RefinementStep[];
          if (mode.refinement) {
            flushStepLines(mode.refinement, mode.lines);
            steps = mode.refinement;
          } else {
            steps = [{
              reason: "",
              isFinal: false,
              body: mode.lines.join("\n"),
            }];
          }
          sections.push({
            kind: "chunk",
            variant: mode.variant,
            name: mode.name,
            overrides: mode.overrides,
            body: steps[steps.length - 1].body,
            steps,
          });
          mode = { tag: "top" };
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
            const h = parseChunkHeader(chunkMatch[1]);
            mode = {
              tag: "chunk",
              ...h,
              lines: [],
              refinement: null,
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
