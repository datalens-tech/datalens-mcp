const MAX_OPENAPI_DEPTH = 100;
const MAX_OPENAPI_NODES = 100_000;

export const validateOpenAPIStructure = (spec: unknown): void => {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
        throw new Error('OpenAPI schema must be an object');
    }

    const pending: {value: unknown; depth: number}[] = [{value: spec, depth: 0}];
    let nodes = 1;
    while (pending.length) {
        const item = pending.pop();
        if (!item) {
            break;
        }
        if (item.depth > MAX_OPENAPI_DEPTH) {
            throw new Error('OpenAPI schema exceeds structural limits');
        }
        if (item.value && typeof item.value === 'object') {
            for (const value of Object.values(item.value)) {
                if (++nodes > MAX_OPENAPI_NODES) {
                    throw new Error('OpenAPI schema exceeds structural limits');
                }
                pending.push({value, depth: item.depth + 1});
            }
        }
    }
};
