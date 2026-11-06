import type {AppConfig} from '../../config';
import {fetchOpenAPISpec} from '../../openapi';
import type {CollectedTool} from '../types';

import {collectTools} from './collect-tools';

export const loadTools = async (config: AppConfig): Promise<CollectedTool[]> => {
    const spec = await fetchOpenAPISpec(config);
    const tools = collectTools(spec, config);
    if (!tools.length) {
        throw new Error('The OpenAPI schema has no enabled commands with a supported x-mcp-scope');
    }
    return tools;
};
