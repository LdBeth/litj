import { stringify } from "@std/xml";
import type { Chunk, Document, Prose } from "./types.ts";
import { isReachable } from "./variants.ts";

// ── XML node builders ────────────────────────────────────────────────────────

interface El {
  type: "element";
  name: { raw: string; prefix: string; local: string; uri: string };
  attributes: Record<string, string>;
  children: Node[];
}

type Node = El | { type: "text"; text: string };

function el(
  tag: string,
  attrs: Record<string, string | undefined>,
  children: Node[] = [],
): El {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) clean[k] = v;
  }
  return {
    type: "element",
    name: { raw: tag, prefix: "", local: tag, uri: "" },
    attributes: clean,
    children,
  };
}

function text(s: string): Node {
  return { type: "text", text: s };
}

// ── weave ───────────────────────────────────────────────────────────────────

/** Weave a document into custom XML for a target variant. */
export function weave(doc: Document, target: string): string {
  const sections = doc.sections.flatMap((section): El[] => {
    if (section.kind === "prose") {
      const t = (section as Prose).text.trim();
      if (!t) return [];
      return [el("prose", {}, [text(t)])];
    }
    const chunk = section as Chunk;
    if (!isReachable(doc.variants, chunk.variant, target)) return [];

    const body: Node[] = chunk.steps.length > 1
      ? chunk.steps.map((step) =>
        el("step", {
          reason: step.reason,
          final: step.isFinal ? "true" : undefined,
        }, [el("code", {}, [text(step.body)])])
      )
      : [el("code", {}, [text(chunk.body)])];

    return [el("chunk", {
      variant: chunk.variant,
      name: chunk.name,
      overrides: chunk.overrides.length > 0
        ? chunk.overrides.join(" ")
        : undefined,
    }, body)];
  });

  const root = el("document", { variant: target }, [
    el(
      "variants",
      { order: doc.variants.names.join(" < ") },
      doc.variants.names.map((name) => el("variant", { name })),
    ),
    ...sections,
  ]);

  return `<?xml version="1.0" encoding="UTF-8"?>\n${
    stringify(root, { indent: "  " })
  }\n`;
}
