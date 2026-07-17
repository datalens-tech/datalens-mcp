import {describe, expect, it} from 'vitest';

import {GatewayError, redactSensitive, serializeGatewayError} from './gateway-error';

describe('gateway errors', () => {
    it('redacts sensitive keys and token-shaped strings recursively', () => {
        const value = redactSensitive({
            authorization: 'Bearer top-secret',
            nested: {
                password: 'secret-password',
                message: 'request failed with token=abc123',
            },
        });

        expect(value).toEqual({
            authorization: '[REDACTED]',
            nested: {
                password: '[REDACTED]',
                message: 'request failed with token=[REDACTED]',
            },
        });
    });

    it('serializes a stable structured error without leaking credentials', () => {
        const serialized = serializeGatewayError(
            new GatewayError('Authorization: Bearer visible-token', {
                kind: 'api',
                code: 'API_ERROR',
                retryable: true,
                status: 503,
                requestId: 'request-1',
                details: {token: 'hidden-token', response: 'password=also-hidden'},
            }),
        );
        const text = JSON.stringify(serialized);

        expect(serialized).toEqual(
            expect.objectContaining({
                code: 'API_ERROR',
                kind: 'api',
                retryable: true,
                status: 503,
                request_id: 'request-1',
            }),
        );
        expect(text).not.toContain('visible-token');
        expect(text).not.toContain('hidden-token');
        expect(text).not.toContain('also-hidden');
    });
});
