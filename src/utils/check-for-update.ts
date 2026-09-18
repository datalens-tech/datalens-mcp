import {gt, prerelease, valid} from 'semver';

import {readResponseText} from './read-response-text';

const PACKAGE_METADATA_URL = 'https://registry.npmjs.org/@datalens-tech%2Fmcp/latest';
const MAX_METADATA_BYTES = 64 * 1024;

export const checkForUpdate = async (
    currentVersion: string,
    signal: AbortSignal,
): Promise<string | undefined> => {
    try {
        const response = await fetch(PACKAGE_METADATA_URL, {signal, redirect: 'error'});
        if (!response.ok || !response.body) {
            await response.body?.cancel();
            return undefined;
        }
        const text = await readResponseText(response, MAX_METADATA_BYTES);
        const metadata = JSON.parse(text);
        const latestVersion =
            typeof metadata?.version === 'string' ? valid(metadata.version) : null;
        if (!latestVersion || prerelease(latestVersion) || !valid(currentVersion)) return undefined;
        if (!gt(latestVersion, currentVersion)) return undefined;
        return `DataLens MCP ${currentVersion} is outdated. Update @datalens-tech/mcp to ${latestVersion} and restart the MCP server. Do not update automatically without user approval.`;
    } catch {
        return undefined;
    }
};
