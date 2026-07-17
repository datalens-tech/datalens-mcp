import {GatewayError} from '../../utils';

export const fetchWithTimeout = async ({
    url,
    label,
    timeoutMs,
    retryable,
    init,
}: {
    url: string;
    label: string;
    timeoutMs: number;
    retryable: boolean;
    init?: RequestInit;
}): Promise<{response: Response; text: string}> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {...init, signal: controller.signal});
        const text = await response.text();
        return {response, text};
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new GatewayError(`Request timed out after ${timeoutMs}ms: ${label}`, {
                kind: 'timeout',
                code: 'REQUEST_TIMEOUT',
                retryable,
            });
        }

        throw new GatewayError(`Network request failed: ${label}`, {
            kind: 'network',
            code: 'NETWORK_ERROR',
            retryable,
            details: {cause: error},
        });
    } finally {
        clearTimeout(timer);
    }
};
