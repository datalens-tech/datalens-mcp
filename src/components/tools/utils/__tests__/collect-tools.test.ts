import {describe, expect, it} from 'vitest';

import type {AppConfig} from '../../../config';
import type {OpenAPISpec} from '../../../openapi';
import {collectTools} from '../collect-tools';

const config: AppConfig = {
    apiUrl: 'https://api.example.com',
    installation: 'internal',
    schemaUrl: 'https://api.example.com/json/',
    apiVersion: 'latest',
    maxResponseChars: 100_000,
};

describe('collectTools', () => {
    it.each(['read', 'write', 'privileged'] as const)(
        'collects an operation with scope %s',
        (scope) => {
            const spec: OpenAPISpec = {paths: {'/rpc/test': {post: {'x-mcp-scope': scope}}}};
            expect(collectTools(spec, config)).toMatchObject([{name: 'test', scope}]);
        },
    );

    it.each([{scope: undefined}, {scope: 'admin'}, {scope: ['read']}, {scope: 'toString'}])(
        'ignores an operation with invalid or missing scope $scope',
        ({scope}) => {
            // OpenAPI arrives as untrusted JSON and may violate the declared type.
            const spec = {paths: {'/rpc/test': {post: {'x-mcp-scope': scope}}}} as OpenAPISpec;
            expect(collectTools(spec, config)).toEqual([]);
        },
    );

    it('collects only POST operations and ignores other methods', () => {
        const spec: OpenAPISpec = {
            paths: {
                '/rpc/getWorkbookEntries': {post: {summary: 'Get entries', 'x-mcp-scope': 'read'}},
                '/rpc/health': {get: {summary: 'Health', 'x-mcp-scope': 'read'}},
            },
        };

        const tools = collectTools(spec, config);

        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe('getWorkbookEntries');
    });

    it('skips operations flagged with x-mcp-disabled', () => {
        const spec: OpenAPISpec = {
            paths: {
                '/rpc/getQLChart': {post: {summary: 'Get', 'x-mcp-scope': 'read'}},
                '/rpc/createQLChart': {
                    post: {summary: 'Create', 'x-mcp-scope': 'write', 'x-mcp-disabled': true},
                },
            },
        };

        const tools = collectTools(spec, config);

        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe('getQLChart');
    });

    it('derives the command name from the last path segment', () => {
        const spec: OpenAPISpec = {
            paths: {'/api/v1/rpc/createDataset': {post: {'x-mcp-scope': 'write'}}},
        };
        expect(collectTools(spec, config)[0].name).toBe('createDataset');
    });

    it('builds a description from summary, description and deprecation flag', () => {
        const spec: OpenAPISpec = {
            paths: {
                '/rpc/a': {post: {summary: 'Sum', description: 'Detail', 'x-mcp-scope': 'read'}},
                '/rpc/b': {post: {summary: 'Old', deprecated: true, 'x-mcp-scope': 'read'}},
                '/rpc/c': {post: {'x-mcp-scope': 'read'}},
            },
        };

        const [a, b, c] = collectTools(spec, config);

        expect(a.description).toBe('Sum — Detail');
        expect(b.description).toBe('[deprecated] Old');
        expect(c.description).toBe('c'); // falls back to the command name
    });

    it('uses an empty object schema when the operation has no request body', () => {
        const spec: OpenAPISpec = {
            paths: {'/rpc/noBody': {post: {'x-mcp-scope': 'read'}}},
        };
        expect(collectTools(spec, config)[0].rawInputSchema).toEqual({
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
                        'x-mcp-scope': 'read',
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

        const schema = collectTools(spec, config)[0].rawInputSchema;

        expect(schema.$ref).toBe('#/$defs/Body');
        expect((schema.$defs as Record<string, unknown>).Body).toEqual(
            spec.components?.schemas?.Body,
        );
    });
});
