const FETCH_TIMEOUT_MS = 30_000;

export const withRequestTimeout = async <T>(
    label: string,
    fn: (signal: AbortSignal) => Promise<T>,
    {
        timeoutMs = FETCH_TIMEOUT_MS,
        signal: requestSignal,
    }: {
        timeoutMs?: number;
        signal?: AbortSignal;
    } = {},
): Promise<T> => {
    const controller = new AbortController();
    const signal = requestSignal
        ? AbortSignal.any([requestSignal, controller.signal])
        : controller.signal;
    const timeoutError = new Error(`Request timed out after ${timeoutMs}ms: ${label}`);
    const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
    try {
        signal.throwIfAborted();
        return await fn(signal);
    } catch (err) {
        // Reading a fetch response body may throw AbortError instead of the abort reason.
        if (signal.aborted && signal.reason === timeoutError) {
            throw timeoutError;
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
};
