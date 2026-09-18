export const MAX_API_RESPONSE_BYTES = 10 * 1024 * 1024;
export const MAX_OPENAPI_RESPONSE_BYTES = 20 * 1024 * 1024;

export const readResponseText = async (response: Response, maxBytes: number): Promise<string> => {
    if (!response.body) {
        return '';
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let bytes = 0;

    try {
        while (true) {
            const {done, value} = await reader.read();
            if (done) {
                break;
            }
            bytes += value.byteLength;
            if (bytes > maxBytes) {
                throw new Error('Response exceeds the maximum allowed size');
            }
            chunks.push(decoder.decode(value, {stream: true}));
        }
        chunks.push(decoder.decode());
        return chunks.join('');
    } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    } finally {
        reader.releaseLock();
    }
};
