import type { Chunk, Document, Prose, Section, VariantOrder } from "./types.ts";

const VARIANT_HEADER = /^NB\.%\s+variants:\s*(.+)$/;
const CHUNK_OPEN = /^NB\.%\s+\[\[(.+)$/;
const CHUNK_CLOSE = /^NB\.%\s+\]\]\s*$/;
const JDEF_OPEN = /^0\s*:\s*0\s*$/;
const JDEF_CLOSE = /^\)\s*$/;

/** Parse a variant ordering declaration like "base < poly < full". */
function parseVariantOrder(decl: string): VariantOrder {
  const names = decl.split("<").map((s) => s.trim()).filter((s) => s.length > 0);
  const successors = new Map<string, string[]>();
  for (let i = 0; i < names.length; i++) {
    successors.set(names[i], names.slice(i + 1));
  }
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
    throw new Error(`Invalid chunk header: "${header}" (expected variant.name)`);
  }
  const variant = primary.slice(0, dot);
  const name = primary.slice(dot + 1);

  const overrides: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith("-")) {
      overrides.push(p.slice(1));
    }
  }

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
  let currentChunk: { variant: string; name: string; overrides: string[] } | null = null;
  let chunkLines: string[] = [];

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
        sections.push({
          kind: "chunk",
          variant: currentChunk!.variant,
          name: currentChunk!.name,
          overrides: currentChunk!.overrides,
          body: chunkLines.join("\n"),
        } as Chunk);
        inChunk = false;
        currentChunk = null;
        chunkLines = [];
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
