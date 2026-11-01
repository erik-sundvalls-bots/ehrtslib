/**
 * Assign RM values at Web Template AQL paths on plain composition instances.
 */

import { hasRmType, isSubtypeOf } from "../../meta/mod.ts";
import { nodeIdsMatch } from "../../generation/id_to_at_code.ts";
import { aqlPathSegments } from "./normalize.ts";

type RmObject = Record<string, unknown>;

/**
 * New RM object of `rmType`. Only LOCATABLE types get `archetype_node_id`;
 * PATHABLE-only types such as ISM_TRANSITION or EVENT_CONTEXT do not.
 */
function newRmObject(
  rmType: string,
  nodeId: string | null,
  nameValue?: string,
): RmObject {
  if (hasRmType(rmType) && !isSubtypeOf(rmType, "LOCATABLE")) {
    return { _type: rmType };
  }
  const obj: RmObject = { _type: rmType, archetype_node_id: nodeId };
  if (nameValue !== undefined) obj.name = { _type: "DV_TEXT", value: nameValue };
  return obj;
}

/** Node id matches, and the `name/value` predicate when the path has one. */
function matchesNode(
  item: RmObject,
  nodeId: string,
  nameValue: string | undefined,
): boolean {
  if (!nodeIdsMatch(item.archetype_node_id, nodeId)) return false;
  if (nameValue === undefined) return true;
  return (item.name as RmObject | undefined)?.value === nameValue;
}

const ATTR_RM_TYPE: Record<string, string> = {
  content: "SECTION",
  data: "ITEM_TREE",
  items: "ELEMENT",
  events: "EVENT",
  protocol: "ITEM_TREE",
  state: "ITEM_TREE",
  description: "ITEM_TREE",
  other_participations: "PARTICIPATION",
  other_context: "ITEM_TREE",
};

/** Attributes that are containers (arrays) in the RM. */
const ARRAY_ATTRS = new Set([
  "content",
  "items",
  "events",
  "activities",
  "rows",
]);

function findOrCreateInArray(
  arr: RmObject[],
  nodeId: string | undefined,
  rmType: string,
  occurrence: number,
  nameValue?: string,
): RmObject {
  if (nodeId) {
    const matches = arr.filter((item) => matchesNode(item, nodeId, nameValue));
    if (occurrence < matches.length) return matches[occurrence];
    // Create missing instances up to the requested occurrence
    let created: RmObject | undefined;
    for (let i = matches.length; i <= occurrence; i++) {
      created = newRmObject(rmType, nodeId, nameValue);
      arr.push(created);
    }
    return created!;
  }
  if (occurrence < arr.length) return arr[occurrence];
  const item: RmObject = newRmObject(rmType, null);
  arr.push(item);
  return item;
}

function ensureChild(
  parent: RmObject,
  attr: string,
  nodeId: string | undefined,
  rmType: string,
  occurrence: number,
  nameValue?: string,
): RmObject {
  const existing = parent[attr];
  if (Array.isArray(existing)) {
    return findOrCreateInArray(
      existing as RmObject[],
      nodeId,
      rmType,
      occurrence,
      nameValue,
    );
  }
  if (existing && typeof existing === "object" && occurrence === 0) {
    return existing as RmObject;
  }
  const child: RmObject = newRmObject(rmType, nodeId ?? null, nameValue);
  if (ARRAY_ATTRS.has(attr) || occurrence > 0) {
    const arr: RmObject[] = existing && typeof existing === "object"
      ? [existing as RmObject]
      : [];
    arr.push(child);
    parent[attr] = arr;
  } else {
    parent[attr] = child;
  }
  return child;
}

function inferRmType(attr: string): string {
  if (attr === "content") return "OBSERVATION";
  return ATTR_RM_TYPE[attr] ?? "CLUSTER";
}

/**
 * Occurrence hints for repeated ancestors: maps the number of AQL segments
 * of the ancestor's path to the instance index to use at that depth.
 */
export type OccurrenceHints = Record<number, number>;

/**
 * RM type hints for intermediate nodes: maps the number of AQL segments of
 * the ancestor's path to its RM type (known from the Web Template lineage).
 */
export type RmTypeHints = Record<number, string>;

/**
 * Assign a data value at an AQL path, creating intermediate RM objects as needed.
 */
export function assignAtAqlPath(
  root: RmObject,
  aqlPath: string,
  leafValue: unknown,
  leafRmType: string,
  elementNodeId?: string,
  occurrences?: OccurrenceHints,
  rmTypes?: RmTypeHints,
): void {
  const segments = aqlPathSegments(aqlPath);
  if (!segments.length) return;

  let current: RmObject = root;

  for (let si = 0; si < segments.length; si++) {
    const { attr, nodeId, nameValue } = segments[si];
    const isLast = si === segments.length - 1;
    const occurrence = occurrences?.[si + 1] ?? 0;

    if (isLast) {
      if (leafRmType === "STRING") {
        current[attr] = leafValue;
        return;
      }
      const isDataValue = leafRmType.startsWith("DV_") ||
        leafRmType.startsWith("C_") ||
        leafRmType === "CODE_PHRASE" ||
        leafRmType.startsWith("PARTY_");

      if (isDataValue && attr === "items") {
        const elemNodeId = elementNodeId || nodeId || null;
        if (!Array.isArray(current.items)) current.items = [];
        const items = current.items as RmObject[];
        // Idempotent per (node id, occurrence): alternative template nodes
        // addressing the same RM node must not create duplicate elements.
        const matches = elemNodeId
          ? items.filter((it) =>
            it._type === "ELEMENT" && matchesNode(it, elemNodeId, nameValue)
          )
          : [];
        if (occurrence < matches.length) {
          matches[occurrence].value = leafValue;
        } else {
          const element = newRmObject("ELEMENT", elemNodeId, nameValue);
          element.value = leafValue;
          items.push(element);
        }
      } else if (isDataValue && attr === "item") {
        // ITEM_SINGLE.item is an ELEMENT, like ITEM_TREE/ITEM_LIST items.
        const existing = current.item as RmObject | undefined;
        if (existing && existing._type === "ELEMENT") {
          existing.value = leafValue;
        } else {
          current.item = {
            _type: "ELEMENT",
            archetype_node_id: elementNodeId || nodeId || null,
            value: leafValue,
          };
        }
      } else if (isDataValue) {
        current[attr] = leafValue;
      } else if (
        leafValue != null && typeof leafValue === "object" &&
        (leafValue as RmObject)._type
      ) {
        // Raw canonical JSON object for a non-data-value node
        if (ARRAY_ATTRS.has(attr)) {
          if (!Array.isArray(current[attr])) current[attr] = [];
          (current[attr] as unknown[]).push(leafValue);
        } else {
          current[attr] = leafValue;
        }
      } else {
        ensureChild(current, attr, nodeId, leafRmType, occurrence, nameValue);
      }
      return;
    }

    const rmType = rmTypes?.[si + 1] ?? inferRmType(attr);
    current = ensureChild(current, attr, nodeId, rmType, occurrence, nameValue);
  }
}

/**
 * The RM object at `aqlPath`, created (with intermediates) when missing.
 * `lastNodeId` overrides the node id of the last path predicate (the Web
 * Template node id of an ELEMENT).
 */
export function ensureAtAqlPath(
  root: RmObject,
  aqlPath: string,
  rmType: string,
  lastNodeId?: string,
  occurrences?: OccurrenceHints,
  rmTypes?: RmTypeHints,
): RmObject {
  const segments = aqlPathSegments(aqlPath);
  if (!segments.length) return root;
  let current: RmObject = root;
  for (let si = 0; si < segments.length; si++) {
    const { attr, nodeId, nameValue } = segments[si];
    const isLast = si === segments.length - 1;
    const occurrence = occurrences?.[si + 1] ?? 0;
    const type = isLast ? rmType : rmTypes?.[si + 1] ?? inferRmType(attr);
    current = ensureChild(
      current,
      attr,
      isLast ? lastNodeId ?? nodeId : nodeId,
      type,
      occurrence,
      nameValue,
    );
  }
  return current;
}
