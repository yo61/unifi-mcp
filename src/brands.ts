/**
 * Branded primitive value objects. Each is a `string` at runtime but a distinct
 * type at compile time, so an `OperationId` cannot be passed where an
 * `EntityTag` is expected. The `as*` smart constructors mark the trust boundary
 * where an untyped string (env, MCP tool argument, parsed spec) becomes a
 * domain value.
 */

export type ApiKey = string & { readonly __brand: "ApiKey" };

export const asApiKey = (value: string): ApiKey => {
  if (value.length === 0) throw new Error("API key must not be empty");
  return value as ApiKey;
};

export type OperationId = string & { readonly __brand: "OperationId" };

export const asOperationId = (value: string): OperationId => value as OperationId;

export type EntityTag = string & { readonly __brand: "EntityTag" };

export const asEntityTag = (value: string): EntityTag => value as EntityTag;
