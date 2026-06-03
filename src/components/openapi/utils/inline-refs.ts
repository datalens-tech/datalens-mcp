import type {JsonSchema} from '../types';

const OPENAPI_COMPONENT_REF_PREFIX = '#/components/schemas/';

const resolveSchema = (
    value: unknown,
    components: Record<string, JsonSchema>,
    visited: ReadonlySet<string>,
): unknown => {
    if (Array.isArray(value)) {
        return value.map((item) => resolveSchema(item, components, visited));
    }

    if (value === null || typeof value !== 'object') {
        return value;
    }

    const obj = value as JsonSchema;
    const ref = typeof obj.$ref === 'string' ? obj.$ref : undefined;

    if (ref && ref.startsWith(OPENAPI_COMPONENT_REF_PREFIX)) {
        const refName = ref.slice(OPENAPI_COMPONENT_REF_PREFIX.length);

        if (visited.has(refName)) {
            return {
                type: 'object',
                description: `Circular reference to ${refName} (omitted)`,
            };
        }

        const target = components[refName];

        if (target === undefined) {
            return obj;
        }

        const nextVisited = new Set(visited);
        nextVisited.add(refName);
        return resolveSchema(target, components, nextVisited);
    }

    const result: JsonSchema = {};

    for (const [key, val] of Object.entries(obj)) {
        result[key] = resolveSchema(val, components, visited);
    }

    return result;
};

// MCP describe_commands returns a self-contained JSON Schema per tool — there is
// no "components" section like in OpenAPI. Resolve every #/components/schemas/X
// reference inline against the spec components before sending schemas to clients.
// Circular references degrade to a {type: 'object'} stub since MCP cannot represent cycles.
export const inlineRefs = (
    schema: JsonSchema,
    components: Record<string, JsonSchema> | undefined,
): JsonSchema => {
    if (!components) {
        return schema;
    }

    return resolveSchema(schema, components, new Set()) as JsonSchema;
};
