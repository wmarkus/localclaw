import type { AnyAgentTool } from "./pi-tools.types.js";

function cleanSchemaForCompatibility(schema: Record<string, unknown>): Record<string, unknown> {
  // Local-only build: no provider-specific schema stripping required.
  return schema;
}

function extractEnumValues(schema: unknown): unknown[] | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  const record = schema as Record<string, unknown>;
  if (Array.isArray(record.enum)) {
    return record.enum;
  }
  if ("const" in record) {
    return [record.const];
  }
  const variants = Array.isArray(record.anyOf)
    ? record.anyOf
    : Array.isArray(record.oneOf)
      ? record.oneOf
      : null;
  if (variants) {
    const values = variants.flatMap((variant) => {
      const extracted = extractEnumValues(variant);
      return extracted ?? [];
    });
    return values.length > 0 ? values : undefined;
  }
  return undefined;
}

function mergePropertySchemas(existing: unknown, incoming: unknown): unknown {
  if (!existing) {
    return incoming;
  }
  if (!incoming) {
    return existing;
  }

  const existingEnum = extractEnumValues(existing);
  const incomingEnum = extractEnumValues(incoming);
  if (existingEnum || incomingEnum) {
    const values = Array.from(new Set([...(existingEnum ?? []), ...(incomingEnum ?? [])]));
    const merged: Record<string, unknown> = {};
    for (const source of [existing, incoming]) {
      if (!source || typeof source !== "object") {
        continue;
      }
      const record = source as Record<string, unknown>;
      for (const key of ["title", "description", "default"]) {
        if (!(key in merged) && key in record) {
          merged[key] = record[key];
        }
      }
    }
    const types = new Set(values.map((value) => typeof value));
    if (types.size === 1) {
      merged.type = Array.from(types)[0];
    }
    merged.enum = values;
    return merged;
  }

  return existing;
}

export function normalizeToolParameters(tool: AnyAgentTool): AnyAgentTool {
  const schema =
    tool.parameters && typeof tool.parameters === "object"
      ? (tool.parameters as Record<string, unknown>)
      : undefined;
  if (!schema) {
    return tool;
  }

  // Normalize tool schemas once here so callers can pass `tools` through unchanged.

  // If schema already has type + properties (no top-level anyOf to merge),
  // still pass it through the normalizer
  if ("type" in schema && "properties" in schema && !Array.isArray(schema.anyOf)) {
    return {
      ...tool,
      parameters: cleanSchemaForCompatibility(schema),
    };
  }

  // Some tool schemas (esp. unions) may omit `type` at the top-level. If we see
  // object-ish fields, force `type: "object"` for compatibility.
  if (
    !("type" in schema) &&
    (typeof schema.properties === "object" || Array.isArray(schema.required)) &&
    !Array.isArray(schema.anyOf) &&
    !Array.isArray(schema.oneOf)
  ) {
    return {
      ...tool,
      parameters: cleanSchemaForCompatibility({ ...schema, type: "object" }),
    };
  }

  const variantKey = Array.isArray(schema.anyOf)
    ? "anyOf"
    : Array.isArray(schema.oneOf)
      ? "oneOf"
      : null;
  if (!variantKey) {
    return tool;
  }
  const variants = schema[variantKey] as unknown[];
  const mergedProperties: Record<string, unknown> = {};
  const requiredCounts = new Map<string, number>();
  let objectVariants = 0;

  for (const entry of variants) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const props = (entry as { properties?: unknown }).properties;
    if (!props || typeof props !== "object") {
      continue;
    }
    objectVariants += 1;
    for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
      if (!(key in mergedProperties)) {
        mergedProperties[key] = value;
        continue;
      }
      mergedProperties[key] = mergePropertySchemas(mergedProperties[key], value);
    }
    const required = Array.isArray((entry as { required?: unknown }).required)
      ? (entry as { required: unknown[] }).required
      : [];
    for (const key of required) {
      if (typeof key !== "string") {
        continue;
      }
      requiredCounts.set(key, (requiredCounts.get(key) ?? 0) + 1);
    }
  }

  const baseRequired = Array.isArray(schema.required)
    ? schema.required.filter((key) => typeof key === "string")
    : undefined;
  const mergedRequired =
    baseRequired && baseRequired.length > 0
      ? baseRequired
      : objectVariants > 0
        ? Array.from(requiredCounts.entries())
            .filter(([, count]) => count === objectVariants)
            .map(([key]) => key)
        : undefined;

  const nextSchema: Record<string, unknown> = { ...schema };
  return {
    ...tool,
    // Flatten union schemas into a single object schema to keep schemas portable.
    parameters: cleanSchemaForCompatibility({
      type: "object",
      ...(typeof nextSchema.title === "string" ? { title: nextSchema.title } : {}),
      ...(typeof nextSchema.description === "string"
        ? { description: nextSchema.description }
        : {}),
      properties:
        Object.keys(mergedProperties).length > 0 ? mergedProperties : (schema.properties ?? {}),
      ...(mergedRequired && mergedRequired.length > 0 ? { required: mergedRequired } : {}),
      additionalProperties: "additionalProperties" in schema ? schema.additionalProperties : true,
    }),
  };
}

export function cleanToolSchema(schema: Record<string, unknown>): unknown {
  return cleanSchemaForCompatibility(schema);
}
