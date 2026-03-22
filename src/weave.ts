import type { Chunk, Document, Prose, VariantOrder } from "./types.ts";
import { isReachable } from "./variants.ts";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Weave a document into custom XML for a target variant. */
export function weave(doc: Document, target: string): string {
  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<document variant="${escapeXml(target)}">`);

  // Emit variant metadata
  out.push(`  <variants order="${doc.variants.names.map(escapeXml).join(" &lt; ")}">`);
  for (const name of doc.variants.names) {
    out.push(`    <variant name="${escapeXml(name)}"/>`);
  }
  out.push(`  </variants>`);

  for (const section of doc.sections) {
    if (section.kind === "prose") {
      const text = (section as Prose).text.trim();
      if (text.length > 0) {
        out.push(`  <prose>${escapeXml(text)}</prose>`);
      }
    } else {
      const chunk = section as Chunk;
      if (!isReachable(doc.variants, chunk.variant, target)) continue;

      const overrideAttr = chunk.overrides.length > 0
        ? ` overrides="${chunk.overrides.map(escapeXml).join(" ")}"`
        : "";
      out.push(
        `  <chunk variant="${escapeXml(chunk.variant)}" name="${escapeXml(chunk.name)}"${overrideAttr}>`,
      );
      out.push(`    <code>${escapeXml(chunk.body)}</code>`);
      out.push(`  </chunk>`);
    }
  }

  out.push(`</document>`);
  return out.join("\n") + "\n";
}
