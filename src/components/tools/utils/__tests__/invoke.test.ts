import {afterEach, describe, expect, it, vi} from 'vitest';

import {testConfig} from '../../../../__tests__/helpers/config';
import {collectTools} from '../collect-tools';

const createCommand = (apiUrl = testConfig.apiUrl) =>
    collectTools(
        {paths: {'/rpc/test': {post: {'x-mcp-scope': 'read'}}}},
        {...testConfig, apiUrl},
    )[0];

describe('DataLens API invocation', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('sends credentials and serialized parameters without following redirects', async () => {
        const fetch = vi.fn().mockResolvedValue(Response.json({ok: true}));
        vi.stubGlobal('fetch', fetch);

        await createCommand().invoke({id: 'entry'}, 'Bearer test-token');

        expect(fetch).toHaveBeenCalledExactlyOnceWith(
            'https://api.example.com/rpc/test',
            expect.objectContaining({
                method: 'POST',
                redirect: 'error',
                body: '{"id":"entry"}',
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-token',
                    'content-type': 'application/json',
                }),
            }),
        );
    });

    it.each([
        {format: 'JSON', body: '{"id":"entry"}', expected: {id: 'entry'}},
        {format: 'text', body: 'plain text', expected: 'plain text'},
    ])('preserves a $format response', async ({body, expected}) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
        expect(await createCommand().invoke({})).toEqual(expected);
    });

    it('rejects insecure HTTP before sending credentials', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        await expect(
            createCommand('http://api.example.com').invoke({}, 'Bearer token'),
        ).rejects.toThrow('HTTPS');
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
        {
            format: 'JSON',
            body: '{"code":"ACCESS_DENIED","message":"Permission denied"}',
            status: 403,
        },
        {format: 'text', body: 'Invalid input', status: 400},
    ])('preserves $format API error details', async ({body, status}) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, {status})));
        await expect(createCommand().invoke({})).rejects.toThrow(body);
    });
});
