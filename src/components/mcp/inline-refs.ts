const OPENAPI_COMPONENT_REF_PREFIX = '#/components/schemas/';

type JsonSchemaLike = Record<string, unknown>;

// MCP describe_commands returns a self-contained JSON Schema per tool — there is
// no "components" section like in OpenAPI. Resolve every #/components/schemas/X
// reference inline against the spec components before sending schemas to clients.
// Circular references degrade to a {type: 'object'} stub since MCP cannot represent cycles.
export const inlineRefs = (
    schema: unknown,
    components: Record<string, unknown> | undefined,
    visited: ReadonlySet<string> = new Set(),
): unknown => {
    if (!components) {
        return schema;
    }

    if (Array.isArray(schema)) {
        return schema.map((item) => inlineRefs(item, components, visited));
    }

    if (schema === null || typeof schema !== 'object') {
        return schema;
    }

    const obj = schema as JsonSchemaLike;
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
        return inlineRefs(target, components, nextVisited);
    }

    const result: JsonSchemaLike = {};
    for (const [key, value] of Object.entries(obj)) {
        result[key] = inlineRefs(value, components, visited);
    }
    return result;
};
