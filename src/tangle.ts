import type { ResolvedChunk } from "./types.ts";

/** Tangle resolved chunks into a single .ijs file. */
export function tangle(chunks: ResolvedChunk[]): string {
  const parts: string[] = [];
  for (const chunk of chunks) {
    parts.push(chunk.body);
  }
  return parts.join("\n\n") + "\n";
}
