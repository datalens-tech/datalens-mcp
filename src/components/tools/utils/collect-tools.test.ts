import {afterEach, describe, expect, it, vi} from 'vitest';

import type {AuthProvider} from '../../auth';
import type {AppConfig} from '../../config';
import type {OpenAPISpec} from '../../openapi';

import {collectTools} from './collect-tools';

const config: AppConfig = {
    apiUrl: 'https://api.example.com',
    installation: 'internal',
    schemaUrl: 'https://api.example.com/json/',
    apiVersion: 'latest',
    maxResponseChars: 100_000,
};

const authProvider: AuthProvider = {getAuthHeader: () => undefined};

describe('collectTools', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('preserves JSON and text results and rejects redirects for authenticated calls', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('{"id":"entry"}'))
            .mockResolvedValueOnce(new Response('plain text'));
        vi.stubGlobal('fetch', fetchMock);
        const [tool] = collectTools({paths: {'/rpc/test': {post: {}}}}, config, {
            getAuthHeader: () => 'Bearer test-token',
        });
        expect(await tool.invoke({id: 'entry'})).toEqual({id: 'entry'});
        expect(await tool.invoke({})).toBe('plain text');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.example.com/rpc/test',
            expect.objectContaining({
                redirect: 'error',
                headers: expect.objectContaining({Authorization: 'Bearer test-token'}),
                body: '{"id":"entry"}',
            }),
        );
    });

    it('rejects HTTP before obtaining or sending credentials', async () => {
        const getAuthHeader = vi.fn();
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const [tool] = collectTools(
            {paths: {'/rpc/test': {post: {}}}},
            {...config, apiUrl: 'http://api.example.com'},
            {getAuthHeader},
        );
        await expect(tool.invoke({})).rejects.toThrow('HTTPS');
        expect(getAuthHeader).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('preserves JSON and text API error details', async () => {
        const details = {code: 'ACCESS_DENIED', message: 'Permission denied'};
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(new Response(JSON.stringify(details), {status: 403}))
                .mockResolvedValueOnce(new Response('Invalid input', {status: 400})),
        );
        const [tool] = collectTools({paths: {'/rpc/test': {post: {}}}}, config, authProvider);
        const error = await tool.invoke({}).catch((error: unknown) => error);
        expect(error).toBeInstanceOf(Error);
        expect(String(error)).toContain(JSON.stringify(details));
        const textError = await tool.invoke({}).catch((error: unknown) => error);
        expect(textError).toBeInstanceOf(Error);
        expect(String(textError)).toContain('Invalid input');
    });
    it('collects only POST operations and ignores other methods', () => {
        const spec: OpenAPISpec = {
            paths: {
                '/rpc/getWorkbookEntries': {post: {summary: 'Get entries'}},
                '/rpc/health': {get: {summary: 'Health'}},
            },
        };

        const tools = collectTools(spec, config, authProvider);

        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe('getWorkbookEntries');
    });

    it('skips operations flagged with x-mcp-disabled', () => {
        const spec: OpenAPISpec = {
            paths: {
                '/rpc/getQLChart': {post: {summary: 'Get'}},
                '/rpc/createQLChart': {post: {summary: 'Create', 'x-mcp-disabled': true}},
            },
        };

        const tools = collectTools(spec, config, authProvider);

        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe('getQLChart');
    });

    it('derives the command name from the last path segment', () => {
        const spec: OpenAPISpec = {
            paths: {'/api/v1/rpc/createDataset': {post: {}}},
        };
        expect(collectTools(spec, config, authProvider)[0].name).toBe('createDataset');
    });

    it('builds a description from summary, description and deprecation flag', () => {
        const spec: OpenAPISpec = {
            paths: {
                '/rpc/a': {post: {summary: 'Sum', description: 'Detail'}},
                '/rpc/b': {post: {summary: 'Old', deprecated: true}},
                '/rpc/c': {post: {}},
            },
        };

        const [a, b, c] = collectTools(spec, config, authProvider);

        expect(a.description).toBe('Sum — Detail');
        expect(b.description).toBe('[deprecated] Old');
        expect(c.description).toBe('c'); // falls back to the command name
    });

    it('uses an empty object schema when the operation has no request body', () => {
        const spec: OpenAPISpec = {
            paths: {'/rpc/noBody': {post: {}}},
        };
        expect(collectTools(spec, config, authProvider)[0].rawInputSchema).toEqual({
            type: 'object',
            properties: {},
        });
    });

    it('bundles request-body $refs into the command input schema', () => {
        const spec: OpenAPISpec = {
            components: {
                schemas: {Body: {type: 'object', properties: {id: {type: 'string'}}}},
            },
            paths: {
                '/rpc/withBody': {
                    post: {
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {$ref: '#/components/schemas/Body'},
                                },
                            },
                        },
                    },
                },
            },
        };

        const schema = collectTools(spec, config, authProvider)[0].rawInputSchema;

        expect(schema.$ref).toBe('#/$defs/Body');
        expect((schema.$defs as Record<string, unknown>).Body).toEqual(
            spec.components?.schemas?.Body,
        );
    });
});
