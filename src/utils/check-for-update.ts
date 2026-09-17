import {gt, prerelease, valid} from 'semver';

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
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > MAX_METADATA_BYTES) {
                    await reader.cancel();
                    return undefined;
                }
                chunks.push(value);
            }
        } finally {
            reader.releaseLock();
        }
        const metadata = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const latestVersion =
            typeof metadata?.version === 'string' ? valid(metadata.version) : null;
        if (!latestVersion || prerelease(latestVersion) || !valid(currentVersion)) return undefined;
        if (!gt(latestVersion, currentVersion)) return undefined;
        return `DataLens MCP ${currentVersion} is outdated. Update @datalens-tech/mcp to ${latestVersion} and restart the MCP server. Do not update automatically without user approval.`;
    } catch {
        return undefined;
    }
};
