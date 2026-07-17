import {describe, expect, it} from 'vitest';

import type {AuthProvider} from '../../auth';
import type {AppConfig} from '../../config';
import type {OpenAPISpec} from '../../openapi';

import {collectTools} from './collect-tools';

const config: AppConfig = {
    apiUrl: 'http://localhost:8080',
    installation: 'internal',
    schemaUrl: 'http://localhost:8080/json/',
    apiVersion: 'latest',
    maxResponseChars: 100_000,
    requestTimeoutMs: 30_000,
    writeMode: 'planned',
    allowDestructive: false,
    allowCommands: [],
    denyCommands: [],
    resultTtlMs: 600_000,
    resultMaxBytes: 10 * 1024 * 1024,
    resultStoreMaxBytes: 50 * 1024 * 1024,
    planTtlMs: 300_000,
};

const authProvider: AuthProvider = {getAuthHeader: () => undefined};

describe('collectTools', () => {
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

    it('uses explicit x-mcp policy and conservative defaults', () => {
        const spec: OpenAPISpec = {
            paths: {
                '/rpc/read': {post: {'x-mcp': {access: 'read'}}},
                '/rpc/write': {
                    post: {
                        'x-mcp': {access: 'write', destructive: true, idempotent: true},
                    },
                },
                '/rpc/unknown': {post: {}},
            },
        };

        const [read, write, unknown] = collectTools(spec, config, authProvider);

        expect(read.policy).toEqual({access: 'read', destructive: false, idempotent: true});
        expect(write.policy).toEqual({access: 'write', destructive: true, idempotent: true});
        expect(unknown.policy).toEqual({
            access: 'unknown',
            destructive: false,
            idempotent: false,
        });
    });

    it('skips operations disabled through the x-mcp object', () => {
        const spec: OpenAPISpec = {
            paths: {'/rpc/disabled': {post: {'x-mcp': {enabled: false}}}},
        };

        expect(collectTools(spec, config, authProvider)).toEqual([]);
    });

    it('rejects invalid or contradictory x-mcp policy', () => {
        const invalidAccess = {
            paths: {'/rpc/a': {post: {'x-mcp': {access: 'other'}}}},
        } as unknown as OpenAPISpec;
        expect(() => collectTools(invalidAccess, config, authProvider)).toThrow(
            'Invalid x-mcp.access',
        );

        const destructiveRead: OpenAPISpec = {
            paths: {
                '/rpc/a': {post: {'x-mcp': {access: 'read', destructive: true}}},
            },
        };
        expect(() => collectTools(destructiveRead, config, authProvider)).toThrow(
            'cannot be marked as destructive',
        );
    });

    it('rejects duplicate names derived from different paths', () => {
        const spec: OpenAPISpec = {
            paths: {
                '/rpc/a': {post: {}},
                '/v2/rpc/a': {post: {}},
            },
        };

        expect(() => collectTools(spec, config, authProvider)).toThrow('Duplicate command name a');
    });

    it('applies exact allow and deny lists with deny taking precedence', () => {
        const spec: OpenAPISpec = {
            paths: {
                '/rpc/a': {post: {}},
                '/rpc/b': {post: {}},
                '/rpc/c': {post: {}},
            },
        };

        const tools = collectTools(
            spec,
            {...config, allowCommands: ['a', 'b'], denyCommands: ['b']},
            authProvider,
        );

        expect(tools.map(({name}) => name)).toEqual(['a']);
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

    it('validates command parameters against the bundled schema', () => {
        const spec: OpenAPISpec = {
            paths: {
                '/rpc/withBody': {
                    post: {
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {id: {type: 'string'}},
                                        required: ['id'],
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const tool = collectTools(spec, config, authProvider)[0];
        expect(() => tool.validateParameters({id: 'ok'})).not.toThrow();
        expect(() => tool.validateParameters({id: 42})).toThrow('Invalid parameters');
        expect(() => tool.validateParameters({})).toThrow('Invalid parameters');
    });
});
