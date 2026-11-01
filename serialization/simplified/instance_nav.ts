/**
 * Navigate RM instance trees using Web Template AQL paths.
 */

import { TypeRegistry } from "../common/type_registry.ts";
import { hasRmType, isSubtypeOf } from "../../meta/mod.ts";
import { nodeIdsMatch } from "../../generation/id_to_at_code.ts";
import type { WebTemplateNode } from "./types.ts";
import { type AqlPathSegment, aqlPathSegments } from "./normalize.ts";

type RmObject = Record<string, unknown>;

function rmTypeName(obj: unknown): string {
  if (obj == null || typeof obj !== "object") return "";
  const record = obj as RmObject;
  if (typeof record._type === "string") return record._type;
  return TypeRegistry.getTypeNameFromInstance(obj) ?? "";
}

function rmProp(obj: unknown, key: string): unknown {
  if (obj == null || typeof obj !== "object") return undefined;
  const record = obj as RmObject;
  if (key in record) return record[key];

  let proto = Object.getPrototypeOf(obj);
  while (proto && proto !== Object.prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (descriptor?.get) {
      try {
        return descriptor.get.call(obj);
      } catch {
        return undefined;
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return undefined;
}

/**
 * True for RM types known not to be LOCATABLE (e.g. ISM_TRANSITION). They have
 * no archetype_node_id, so a template path predicate cannot be checked on them.
 */
function isNonLocatable(obj: unknown): boolean {
  const type = rmTypeName(obj);
  return !!type && hasRmType(type) && !isSubtypeOf(type, "LOCATABLE");
}

/** `name.value` of an RM object, as a string. */
function nameValueOf(obj: unknown): string | undefined {
  const value = rmProp(rmProp(obj, "name"), "value");
  return value == null ? undefined : String(value);
}

/** The object matches the segment's node id and `name/value` predicate. */
function matchesSegment(obj: unknown, seg: AqlPathSegment): boolean {
  if (!seg.nodeId) return true;
  if (!nodeIdsMatch(rmProp(obj, "archetype_node_id"), seg.nodeId)) return false;
  return seg.nameValue === undefined || nameValueOf(obj) === seg.nameValue;
}

/** A single-valued attribute object matches the segment's predicate. */
function singleMatchesSegment(obj: unknown, seg: AqlPathSegment): boolean {
  const id = rmProp(obj, "archetype_node_id");
  if (id == null || id === "") return isNonLocatable(obj);
  return matchesSegment(obj, seg);
}

function pickBySegment(arr: unknown[], seg: AqlPathSegment): unknown {
  return arr.find((item) => matchesSegment(item, seg)) ?? arr[0];
}

function valuesBySegment(arr: unknown[], seg: AqlPathSegment): unknown[] {
  if (!seg.nodeId) return arr;
  const found = arr.filter((item) => matchesSegment(item, seg));
  if (found.length) return found;
  // Fall back to unmatched items only when none of them carry a node id at
  // all (e.g. hand-built instances); otherwise a wrong-node match would
  // silently return another sibling's data.
  const anyIds = arr.some((item) => {
    const id = rmProp(item, "archetype_node_id");
    return id != null && id !== "";
  });
  return anyIds ? [] : arr.slice(0, 1);
}

/** A resolved value and, for a leaf below an ELEMENT, that ELEMENT. */
export interface ResolvedValue {
  value: unknown;
  /** The ELEMENT whose `value` this is (absent for other values). */
  element?: RmObject;
}

function filterPairsByRmType(values: ResolvedValue[], rmType?: string): ResolvedValue[] {
  if (!rmType) return values;
  const filtered = values.filter((item) => rmTypeName(item.value) === rmType);
  return filtered.length ? filtered : values;
}

/**
 * Like {@link resolveChildWebTemplateNodes}, with the ELEMENT of each leaf
 * value (for its own attributes such as `uid`, `links`, `feeder_audit`).
 */
export function resolveChildWebTemplateNodeValues(
  rootInstance: unknown,
  parentInstance: unknown,
  parentNode: WebTemplateNode,
  childNode: WebTemplateNode,
): ResolvedValue[] {
  const parentPath = parentNode.aqlPath ?? "/";
  const childPath = childNode.aqlPath ?? "/";

  if (parentPath === "/" || parentPath === "") {
    return resolveAllValuesAtWebTemplateNode(rootInstance, childNode);
  }

  if (childPath.startsWith(parentPath)) {
    const relative = childPath.slice(parentPath.length);
    const relativePath = relative.startsWith("/") ? relative : `/${relative}`;
    return filterPairsByRmType(resolveAllValuesAtPath(parentInstance, relativePath), childNode.rmType);
  }

  // Child path is not under the parent path (e.g. sibling attribute);
  // resolve it absolutely from the root instance.
  return resolveAllValuesAtWebTemplateNode(rootInstance, childNode);
}

/** Resolve child template nodes relative to a parent instance slice. */
export function resolveChildWebTemplateNodes(
  rootInstance: unknown,
  parentInstance: unknown,
  parentNode: WebTemplateNode,
  childNode: WebTemplateNode,
): unknown[] {
  return resolveChildWebTemplateNodeValues(rootInstance, parentInstance, parentNode, childNode)
    .map((r) => r.value);
}

/** Like {@link resolveAllAtWebTemplateNode}, with the ELEMENT of each leaf value. */
export function resolveAllValuesAtWebTemplateNode(
  instance: unknown,
  node: WebTemplateNode,
): ResolvedValue[] {
  const values = node.aqlPath === "/"
    ? [{ value: instance }]
    : resolveAllValuesAtPath(instance, node.aqlPath);
  return filterPairsByRmType(values, node.rmType);
}

/** Resolve instance data for a Web Template node, filtering by rmType when needed. */
export function resolveAllAtWebTemplateNode(
  instance: unknown,
  node: WebTemplateNode,
): unknown[] {
  return resolveAllValuesAtWebTemplateNode(instance, node).map((r) => r.value);
}

/**
 * Resolve data at a Web Template node's AQL path within a composition instance.
 */
export function resolveAtPath(instance: unknown, aqlPath: string): unknown {
  if (!instance || !aqlPath) return null;

  const segments = aqlPathSegments(aqlPath);
  if (!segments.length) return instance;

  let current: unknown = instance;

  for (const seg of segments) {
    const { attr } = seg;
    const obj = current as RmObject;
    if (!obj || typeof obj !== "object") return null;

    let next = rmProp(obj, attr);
    if (next == null) return null;

    if (Array.isArray(next)) {
      current = seg.nodeId ? pickBySegment(next, seg) : next[0];
    } else {
      current = next;
    }
  }

  // ELEMENT nodes resolve to their value child
  if (rmTypeName(current) === "ELEMENT" && rmProp(current, "value") != null) {
    return rmProp(current, "value");
  }

  return current;
}

/**
 * Resolve all matching data nodes at a Web Template AQL path.
 *
 * This is primarily used by example generation/serialization, where maximal
 * mode can create multiple instances for repeating template nodes.
 */
export function resolveAllAtPath(
  instance: unknown,
  aqlPath: string,
): unknown[] {
  return resolveAllValuesAtPath(instance, aqlPath).map((r) => r.value);
}

/** Like {@link resolveAllAtPath}, with the ELEMENT of each unwrapped value. */
export function resolveAllValuesAtPath(
  instance: unknown,
  aqlPath: string,
): ResolvedValue[] {
  if (!instance || !aqlPath) return [];

  const segments = aqlPathSegments(aqlPath);
  if (!segments.length) return [{ value: instance }];

  let current: unknown[] = [instance];

  for (const seg of segments) {
    const { attr } = seg;
    const nextValues: unknown[] = [];

    for (const item of current) {
      const obj = item as RmObject;
      if (!obj || typeof obj !== "object") continue;
      const next = rmProp(obj, attr);
      if (next == null) continue;

      if (Array.isArray(next)) {
        nextValues.push(...valuesBySegment(next, seg));
      } else if (
        !seg.nodeId || singleMatchesSegment(next, seg)
      ) {
        nextValues.push(next);
      }
    }

    current = nextValues;
    if (!current.length) return [];
  }

  return current.map((item) => {
    if (rmTypeName(item) === "ELEMENT" && rmProp(item, "value") != null) {
      return { value: rmProp(item, "value"), element: item as RmObject };
    }
    return { value: item };
  });
}

/** Count how many sibling instances exist at the parent's attribute for indexed paths. */
export function countInstancesAtPath(
  instance: unknown,
  parentPath: string,
  attr: string,
): number {
  const parent = parentPath ? resolveAtPath(instance, parentPath) : instance;
  if (!parent) return 0;
  const val = rmProp(parent, attr);
  if (Array.isArray(val)) return val.length;
  return val != null ? 1 : 0;
}
