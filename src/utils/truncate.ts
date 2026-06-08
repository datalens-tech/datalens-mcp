// Cap text forwarded to the MCP client so a single huge response can't blow up
// the model's context. Appends a marker noting how much was dropped and how to
// raise the limit. A non-positive/undefined limit disables truncation.
export const truncateText = (text: string, maxChars?: number): string => {
    if (maxChars === undefined || maxChars <= 0 || text.length <= maxChars) {
        return text;
    }

    const omitted = text.length - maxChars;
    return `${text.slice(0, maxChars)}\n\n…[truncated ${omitted} of ${text.length} chars; raise DATALENS_MAX_RESPONSE_CHARS to see more]`;
};
