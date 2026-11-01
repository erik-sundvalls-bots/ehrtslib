/**
 * RM type of an instance: a typed RM class instance by its class, a plain
 * JSON object by its `_type` string.
 *
 * Typed RM classes keep each attribute in a `_<name>` field, so for classes
 * with an attribute called `type` (DV_IDENTIFIER, OBJECT_REF, PARTY_REF, …)
 * `_type` holds that attribute, not the RM type name. Only plain objects are
 * read by `_type`.
 */

import { TypeRegistry } from "../serialization/common/type_registry.ts";

export function instanceRmType(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const ctor = (value as object).constructor;
  if (typeof ctor === "function" && ctor !== Object) {
    const name = TypeRegistry.getTypeNameFromInstance(value);
    return name && name !== "OBJECT" && name !== "ARRAY" ? name : undefined;
  }
  const type = (value as Record<string, unknown>)._type;
  return typeof type === "string" && type.length > 0 ? type : undefined;
}
