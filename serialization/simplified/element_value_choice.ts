/**
 * ELEMENT nodes without a value constraint ("any" ELEMENTs).
 *
 * The template allows any DATA_VALUE in `ELEMENT.value`, so the value's RM
 * type has to be in the FLAT path. Simplified Formats writes a choice of
 * value types as a `<type>_value` segment below the ELEMENT (spec §5.8:
 * `…/labresult/text_value`), the id being the type without `DV_`, in lower
 * case. Writer, reader and validator use the virtual leaf nodes below.
 * @see openehr://guides/specs/its-rest-simplified_formats
 */

import type { WebTemplateNode } from "./types.ts";
import { hasRmType, isAbstractType, isSubtypeOf } from "../../meta/mod.ts";

/** An ELEMENT leaf: no value constraint, so no inputs and no children. */
export function isUnconstrainedElement(node: WebTemplateNode): boolean {
  return node.rmType === "ELEMENT" && !node.children?.length &&
    !node.inputs?.length;
}

/** `DV_CODED_TEXT` → `coded_text_value` (generic parameters dropped). */
export function valueChoiceId(rmType: string): string {
  return `${
    rmType.replace(/<.*$/, "").replace(/^DV_/, "").toLowerCase()
  }_value`;
}

/** `coded_text_value` → `DV_CODED_TEXT`, when that is a concrete data value type. */
export function valueChoiceType(segmentId: string): string | undefined {
  const m = /^([a-z0-9_]+)_value$/.exec(segmentId);
  if (!m) return undefined;
  const rmType = `DV_${m[1].toUpperCase()}`;
  if (!hasRmType(rmType) || isAbstractType(rmType)) return undefined;
  return isSubtypeOf(rmType, "DATA_VALUE") ? rmType : undefined;
}

/**
 * Leaf node for the value of an unconstrained ELEMENT as `rmType`: it
 * addresses `ELEMENT.value` and keeps the ELEMENT's node id and names.
 */
export function elementValueChoiceNode(
  element: WebTemplateNode,
  rmType: string,
): WebTemplateNode {
  const {
    children: _children,
    inputs: _inputs,
    annotations: _annotations,
    ...rest
  } = element;
  return {
    ...rest,
    id: valueChoiceId(rmType),
    rmType,
    min: 0,
    max: 1,
    aqlPath: `${element.aqlPath}/value`,
  };
}

/**
 * Node for an id chain (`a/b/c`, indices stripped), including the
 * `<type>_value` leaf below an unconstrained ELEMENT.
 */
export function nodeForChain(
  nodeByChain: ReadonlyMap<string, WebTemplateNode>,
  chain: string,
): WebTemplateNode | undefined {
  const node = nodeByChain.get(chain);
  if (node) return node;
  const cut = chain.lastIndexOf("/");
  if (cut === -1) return undefined;
  const element = nodeByChain.get(chain.slice(0, cut));
  const rmType = valueChoiceType(chain.slice(cut + 1));
  if (!element || !rmType || !isUnconstrainedElement(element)) return undefined;
  return elementValueChoiceNode(element, rmType);
}
