import {mkdtemp, rm, writeFile} from 'fs/promises';
import os from 'os';
import path from 'path';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {AppConfig} from '../../config';

import {fetchOpenAPISpec} from './fetch-openapi-spec';

const baseConfig: AppConfig = {
    apiUrl: 'http://api.example',
    installation: 'internal',
    schemaUrl: 'http://schema.example/json/?token=secret',
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

let tempDir: string;

beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'datalens-mcp-openapi-'));
});

afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await rm(tempDir, {recursive: true, force: true});
});

describe('fetchOpenAPISpec', () => {
    it('loads and validates an explicitly configured local schema', async () => {
        const schemaPath = path.join(tempDir, 'schema.json');
        await writeFile(schemaPath, JSON.stringify({paths: {'/rpc/a': {post: {}}}}));

        const loaded = await fetchOpenAPISpec({...baseConfig, schemaPath});

        expect(loaded.spec.paths).toHaveProperty('/rpc/a');
        expect(loaded.source).toBe(`file:${schemaPath}`);
    });

    it('rejects a document without a paths object', async () => {
        const schemaPath = path.join(tempDir, 'invalid.json');
        await writeFile(schemaPath, JSON.stringify({openapi: '3.0.0'}));

        await expect(fetchOpenAPISpec({...baseConfig, schemaPath})).rejects.toMatchObject({
            code: 'INVALID_OPENAPI_SCHEMA',
        });
    });

    it('retries transient schema failures and strips query credentials from its source', async () => {
        vi.useFakeTimers();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('busy', {status: 503}))
            .mockResolvedValueOnce(new Response('busy', {status: 429}))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({paths: {}}), {
                    status: 200,
                    headers: {'content-type': 'application/json'},
                }),
            );
        vi.stubGlobal('fetch', fetchMock);

        const pending = fetchOpenAPISpec(baseConfig);
        await vi.runAllTimersAsync();
        const loaded = await pending;

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(loaded.source).toBe('http://schema.example/json/');
        expect(loaded.source).not.toContain('secret');
    });

    it('falls back to a configured valid cache after a remote failure', async () => {
        const cachePath = path.join(tempDir, 'schema-cache.json');
        await writeFile(cachePath, JSON.stringify({paths: {'/rpc/cached': {post: {}}}}));
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('bad request', {status: 400})),
        );
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const loaded = await fetchOpenAPISpec({...baseConfig, schemaCachePath: cachePath});

        expect(loaded.spec.paths).toHaveProperty('/rpc/cached');
        expect(loaded.source).toBe(`cache:${cachePath}`);
    });
});
