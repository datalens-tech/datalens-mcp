const FETCH_TIMEOUT_MS = 30_000;

export const withRequestTimeout = async <T>(
    label: string,
    fn: (signal: AbortSignal) => Promise<T>,
    timeoutMs = FETCH_TIMEOUT_MS,
): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fn(controller.signal);
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeoutMs}ms: ${label}`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
};
