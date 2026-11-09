import {loadTools} from '../tools';

import type {HttpConfig} from './config';

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export const createToolCatalog = async (config: HttpConfig) => {
    let tools = await loadTools(config);

    const scheduleRefresh = () => {
        setTimeout(async () => {
            try {
                tools = await loadTools(config);
            } catch (err) {
                console.error(
                    'Failed to refresh the OpenAPI command catalog; keeping the previous catalog:',
                    err instanceof Error ? err.message : String(err),
                );
            } finally {
                scheduleRefresh();
            }
        }, REFRESH_INTERVAL_MS).unref();
    };

    scheduleRefresh();

    return {
        getTools: () => tools,
    };
};
