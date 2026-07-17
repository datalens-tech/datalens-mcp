import {randomUUID} from 'crypto';

import {GatewayError} from '../../../utils';

type StoredResult = {
    text: string;
    bytes: number;
    expiresAt: number;
};

export type StoredResultDescriptor = {
    type: 'stored_result';
    result_id: string;
    preview: string;
    total_chars: number;
    next_offset: number;
    expires_at: string;
};

export class ResultStore {
    private readonly entries = new Map<string, StoredResult>();
    private readonly options: {
        ttlMs: number;
        maxItemBytes: number;
        maxTotalBytes: number;
        chunkChars: number;
    };
    private totalBytes = 0;

    constructor(options: ResultStore['options']) {
        this.options = options;
    }

    store(text: string): StoredResultDescriptor {
        const bytes = Buffer.byteLength(text, 'utf8');
        if (bytes > this.options.maxItemBytes || bytes > this.options.maxTotalBytes) {
            throw new GatewayError('Command result exceeds the configured result-store limit', {
                kind: 'result',
                code: 'RESULT_TOO_LARGE',
                details: {
                    preview: text.slice(0, this.options.chunkChars),
                    total_chars: text.length,
                    total_bytes: bytes,
                    max_result_bytes: Math.min(
                        this.options.maxItemBytes,
                        this.options.maxTotalBytes,
                    ),
                },
            });
        }

        this.evictUntilFits(bytes);
        const id = randomUUID();
        const expiresAt = Date.now() + this.options.ttlMs;
        this.entries.set(id, {text, bytes, expiresAt});
        this.totalBytes += bytes;
        const preview = text.slice(0, this.options.chunkChars);

        return {
            type: 'stored_result',
            result_id: id,
            preview,
            total_chars: text.length,
            next_offset: preview.length,
            expires_at: new Date(expiresAt).toISOString(),
        };
    }

    read(
        id: string,
        offset: number,
        requestedLimit: number | undefined,
    ): {
        result_id: string;
        text: string;
        offset: number;
        next_offset: number;
        total_chars: number;
        done: boolean;
    } {
        const entry = this.entries.get(id);
        if (entry && entry.expiresAt <= Date.now()) {
            this.remove(id);
            throw new GatewayError(`Stored result ${id} has expired`, {
                kind: 'result',
                code: 'RESULT_EXPIRED',
            });
        }
        if (!entry) {
            throw new GatewayError(`Stored result ${id} was not found`, {
                kind: 'result',
                code: 'RESULT_NOT_FOUND',
            });
        }
        if (!Number.isInteger(offset) || offset < 0 || offset > entry.text.length) {
            throw new GatewayError('read_result offset must be within the stored result', {
                kind: 'validation',
                code: 'INVALID_RESULT_OFFSET',
            });
        }
        if (
            requestedLimit !== undefined &&
            (!Number.isInteger(requestedLimit) || requestedLimit <= 0)
        ) {
            throw new GatewayError('read_result limit must be a positive integer', {
                kind: 'validation',
                code: 'INVALID_RESULT_LIMIT',
            });
        }

        const limit = Math.min(requestedLimit ?? this.options.chunkChars, this.options.chunkChars);
        const text = entry.text.slice(offset, offset + limit);
        const nextOffset = offset + text.length;

        // Touch the entry so Map insertion order doubles as LRU order.
        this.entries.delete(id);
        this.entries.set(id, entry);

        return {
            result_id: id,
            text,
            offset,
            next_offset: nextOffset,
            total_chars: entry.text.length,
            done: nextOffset >= entry.text.length,
        };
    }

    private remove(id: string): void {
        const entry = this.entries.get(id);
        if (entry) {
            this.totalBytes -= entry.bytes;
            this.entries.delete(id);
        }
    }

    private removeExpired(now = Date.now()): void {
        for (const [id, entry] of this.entries) {
            if (entry.expiresAt <= now) {
                this.remove(id);
            }
        }
    }

    private evictUntilFits(bytes: number): void {
        this.removeExpired();
        while (this.totalBytes + bytes > this.options.maxTotalBytes) {
            const oldestId = this.entries.keys().next().value as string | undefined;
            if (!oldestId) {
                break;
            }
            this.remove(oldestId);
        }
    }
}
