import type { ResolvedChunk } from "./types.ts";

/** Tangle resolved chunks into a single .ijs file. */
export function tangle(chunks: ResolvedChunk[]): string {
  return chunks.map((c) => c.body).join("\n");
}
