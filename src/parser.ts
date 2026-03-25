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

/** Parse a literate J source file. */
export function parse(source: string): Document {
  const lines = source.split("\n");
  let variants: VariantOrder | null = null;
  const sections: Section[] = [];

  let proseLines: string[] = [];
  let inChunk = false;
  let inJdef = false;
  let currentChunk:
    | { variant: string; name: string; overrides: string[] }
    | null = null;
  let chunkLines: string[] = [];
  let inRefinement = false;
  let refinementSteps: RefinementStep[] = [];

  function flushProse() {
    const text = proseLines.join("\n");
    if (text.trim().length > 0) {
      sections.push({ kind: "prose", text } as Prose);
    }
    proseLines = [];
  }

  for (const line of lines) {
    if (inChunk) {
      if (CHUNK_CLOSE.test(line)) {
        let steps: RefinementStep[];
        let body: string;
        if (inRefinement) {
          // Flush remaining lines into the last step
          refinementSteps[refinementSteps.length - 1].body = chunkLines.join(
            "\n",
          );
          steps = refinementSteps;
          body = steps[steps.length - 1].body;
        } else {
          body = chunkLines.join("\n");
          steps = [{ reason: "", isFinal: false, body }];
        }
        sections.push({
          kind: "chunk",
          variant: currentChunk!.variant,
          name: currentChunk!.name,
          overrides: currentChunk!.overrides,
          body,
          steps,
        });
        inChunk = false;
        inRefinement = false;
        currentChunk = null;
        chunkLines = [];
        refinementSteps = [];
      } else if (REFINE_OPEN.test(line) && !inRefinement) {
        inRefinement = true;
        refinementSteps = [{ reason: "", isFinal: false, body: "" }];
        chunkLines = [];
      } else if (inRefinement && REFINE_STEP.test(line)) {
        const m = line.match(REFINE_STEP)!;
        const reason = m[1].trim();
        const isFinal = m[2] !== undefined;
        // Flush accumulated lines into current (last) step
        refinementSteps[refinementSteps.length - 1].body = chunkLines.join(
          "\n",
        );
        chunkLines = [];
        refinementSteps.push({ reason, isFinal, body: "" });
      } else {
        chunkLines.push(line);
      }
      continue;
    }

    if (inJdef) {
      if (JDEF_CLOSE.test(line)) {
        flushProse();
        inJdef = false;
      } else {
        proseLines.push(line);
      }
      continue;
    }

    const variantMatch = line.match(VARIANT_HEADER);
    if (variantMatch) {
      flushProse();
      variants = parseVariantOrder(variantMatch[1]);
      continue;
    }

    const chunkMatch = line.match(CHUNK_OPEN);
    if (chunkMatch) {
      flushProse();
      currentChunk = parseChunkHeader(chunkMatch[1]);
      inChunk = true;
      chunkLines = [];
      continue;
    }

    if (JDEF_OPEN.test(line)) {
      inJdef = true;
      continue;
    }

    // All other lines (plain NB. comments, blank lines, etc.) are discarded.
  }

  if (inChunk) {
    throw new Error("Unterminated chunk at end of file");
  }

  if (inJdef) {
    throw new Error("Unterminated 0 : 0 block at end of file");
  }

  if (!variants) {
    throw new Error("Missing variant declaration (NB.% variants: ...)");
  }

  return { variants, sections };
}
