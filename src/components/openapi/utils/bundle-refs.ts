import type {JsonSchema} from '../types';

const OPENAPI_COMPONENT_REF_PREFIX = '#/components/schemas/';
const DEFS_REF_PREFIX = '#/$defs/';

// Rewrite a single #/components/schemas/X ref string to #/$defs/X, recording the
// component name in `used`. Non-component strings are returned unchanged.
const rewriteRefString = (ref: string, used: Set<string>): string => {
    if (!ref.startsWith(OPENAPI_COMPONENT_REF_PREFIX)) {
        return ref;
    }
    const name = ref.slice(OPENAPI_COMPONENT_REF_PREFIX.length);
    used.add(name);
    return `${DEFS_REF_PREFIX}${name}`;
};

// A discriminator's `mapping` maps discriminator values to component refs, but those
// refs live as the *values* of arbitrary keys rather than under a `$ref` key, so the
// generic walk below would miss them. Rewrite each mapped ref explicitly.
function rewriteDiscriminator(value: object, used: Set<string>): JsonSchema {
    const result: JsonSchema = {};

    for (const [key, val] of Object.entries(value)) {
        if (key === 'mapping' && val !== null && typeof val === 'object' && !Array.isArray(val)) {
            const mapping: Record<string, unknown> = {};
            for (const [target, ref] of Object.entries(val)) {
                mapping[target] = typeof ref === 'string' ? rewriteRefString(ref, used) : ref;
            }
            result.mapping = mapping;
        } else {
            result[key] = rewriteRefs(val, used);
        }
    }

    return result;
}

// Walk a value tree, rewriting every #/components/schemas/X ref to #/$defs/X and
// recording each referenced component name in `used`. Sibling keys are preserved.
// Refs appear both under `$ref` keys and inside `discriminator.mapping` values.
function rewriteRefs(value: unknown, used: Set<string>): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => rewriteRefs(item, used));
    }

    if (value === null || typeof value !== 'object') {
        return value;
    }

    const result: JsonSchema = {};

    for (const [key, val] of Object.entries(value as JsonSchema)) {
        if (key === '$ref' && typeof val === 'string') {
            result.$ref = rewriteRefString(val, used);
        } else if (key === 'discriminator' && val !== null && typeof val === 'object') {
            result.discriminator = rewriteDiscriminator(val, used);
        } else {
            result[key] = rewriteRefs(val, used);
        }
    }

    return result;
}

// OpenAPI request schemas reference shared definitions via #/components/schemas/X,
// but each MCP command schema must be self-contained. Rather than inlining every
// $ref (which duplicates subtrees and blows up exponentially on diamond-shaped
// references), we bundle: rewrite refs to #/$defs/X and attach a $defs section
// containing only the components transitively reachable from `schema`.
//
// This keeps the schema standalone, dedupes shared definitions, and represents
// cycles natively — a recursive type just points back into $defs, no stubbing.
export const bundleRefs = (
    schema: JsonSchema,
    components: Record<string, JsonSchema> | undefined,
): JsonSchema => {
    if (!components) {
        return schema;
    }

    const used = new Set<string>();
    const root = rewriteRefs(schema, used) as JsonSchema;

    const defs: Record<string, JsonSchema> = {};
    const processed = new Set<string>();
    const queue = [...used];

    while (queue.length > 0) {
        const name = queue.shift() as string;
        if (processed.has(name)) {
            continue;
        }
        processed.add(name);

        const target = components[name];
        if (target === undefined) {
            defs[name] = {type: 'object', description: `Unresolved reference: ${name}`};
            continue;
        }

        defs[name] = rewriteRefs(target, used) as JsonSchema;

        for (const ref of used) {
            if (!processed.has(ref)) {
                queue.push(ref);
            }
        }
    }

    if (Object.keys(defs).length === 0) {
        return root;
    }

    return {...root, $defs: defs};
};
