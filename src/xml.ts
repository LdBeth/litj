import { stringify as _stringify } from "@std/xml";
import type {
  StringifyOptions,
  XmlDocument as _XmlDocument,
  XmlElement,
  XmlNode,
  XmlTextNode,
} from "@std/xml";
export type { XmlElement, XmlNode, XmlTextNode } from "@std/xml";
export type XmlDeclaration = {
  type: "declaration";
  version: string;
  encoding?: string;
};

export type XmlDocument = Omit<_XmlDocument, "declaration"> & {
  declaration?: XmlDeclaration;
};

export const decl: XmlDeclaration = {
  type: "declaration",
  version: "1.0",
  encoding: "UTF-8",
};

export function el(
  tag: string,
  attrs: Record<string, string | undefined>,
  children: XmlNode[] = [],
): XmlElement {
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

export function text(s: string): XmlTextNode {
  return { type: "text", text: s };
}

export const stringify = _stringify as (
  node: XmlDocument | XmlElement,
  options?: StringifyOptions,
) => string;
