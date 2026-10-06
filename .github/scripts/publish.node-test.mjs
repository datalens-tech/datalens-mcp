import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkRegistry, validatePack, validateTarball, validateVersion} from './publish.mjs';

const name = '@datalens-tech/mcp';
const version = '1.2.3';
const integrity = `sha512-${'A'.repeat(86)}==`;
const pkg = {
    name,
    version,
    main: 'dist/index.js',
    bin: {'datalens-mcp': './dist/index.js'},
    publishConfig: {access: 'public'},
};
const lock = {name, version, packages: {'': {name, version}}};
const files = [
    'package.json',
    'README.md',
    'LICENSE',
    'NOTICES',
    'dist/index.js',
    'dist/app.js',
    'dist/utils/get-package-version.js',
];
const pack = {
    name,
    version,
    filename: `datalens-tech-mcp-${version}.tgz`,
    integrity,
    files: files.map((path) => ({path})),
};

test('accepts a stable version with matching package metadata', () => {
    assert.equal(validateVersion(pkg, lock, version), version);
});

test('rejects prereleases and noncanonical versions', () => {
    for (const invalid of ['1.2.3-beta.1', 'v1.2.3', '01.2.3', '1.2']) {
        assert.throws(
            () => validateVersion({...pkg, version: invalid}, lock, invalid),
            /stable semantic version/,
        );
    }
});

test('rejects an unexpected version or mismatched lockfile', () => {
    assert.throws(() => validateVersion(pkg, lock, '1.2.4'), /Expected version/);
    assert.throws(
        () => validateVersion(pkg, {...lock, version: '1.2.4'}, version),
        /versions must match/,
    );
    assert.throws(
        () => validateVersion(pkg, {...lock, packages: {'': {...pkg, version: '1.2.4'}}}, version),
        /versions must match/,
    );
});

test('rejects incorrect package identity, publishing access, and entrypoint', () => {
    for (const patch of [
        {name: 'other'},
        {private: true},
        {publishConfig: {access: 'restricted'}},
        {main: 'src/index.ts'},
    ]) {
        assert.throws(() => validateVersion({...pkg, ...patch}, lock, version));
    }
});

test('accepts the package artifact and rejects unexpected content', () => {
    assert.equal(validatePack([pack], version), pack);
    for (const path of [
        'src/index.ts',
        'dist/app.js.map',
        'dist/app.test.js',
        'dist/__tests__/app.js',
        '../secret.js',
    ]) {
        assert.throws(
            () => validatePack([{...pack, files: [...pack.files, {path}]}], version),
            /Unexpected file/,
        );
    }
});

test('rejects missing entrypoints and invalid artifact metadata', () => {
    assert.throws(
        () =>
            validatePack(
                [{...pack, files: pack.files.filter((file) => file.path !== 'dist/index.js')}],
                version,
            ),
        /Required file/,
    );
    assert.throws(() => validatePack([], version), /exactly one/);
    assert.throws(() => validatePack([{...pack, version: '1.2.4'}], version), /name or version/);
    assert.throws(() => validatePack([{...pack, integrity: 'sha1-invalid'}], version), /SHA512/);
});

test('reports only HTTP 404 as an unpublished version', async () => {
    assert.equal(
        await checkRegistry(version, integrity, async (url, options) => {
            assert.equal(url, 'https://registry.npmjs.org/@datalens-tech%2fmcp');
            assert.ok(options.signal instanceof AbortSignal);
            return {status: 404};
        }),
        false,
    );
});

test('accepts an already published version only when integrity matches', async () => {
    const response = (metadata) => async () => ({status: 200, json: async () => metadata});
    assert.equal(
        await checkRegistry(
            version,
            integrity,
            response({
                name,
                versions: {[version]: {dist: {integrity}}},
                'dist-tags': {latest: '9.0.0'},
            }),
        ),
        true,
    );
    await assert.rejects(
        checkRegistry(
            version,
            integrity,
            response({name, versions: {[version]: {dist: {integrity: 'different'}}}}),
        ),
        /does not match/,
    );
});

test('fails on registry authentication, server, parsing, and network errors', async () => {
    for (const status of [401, 403, 429, 500]) {
        await assert.rejects(
            checkRegistry(version, integrity, async () => ({status})),
            new RegExp(`HTTP ${status}`),
        );
    }
    await assert.rejects(
        checkRegistry(version, integrity, async () => {
            throw new Error('Network unavailable');
        }),
        /Network unavailable/,
    );
    await assert.rejects(
        checkRegistry(version, integrity, async () => ({
            status: 200,
            json: async () => {
                throw new Error('Invalid JSON');
            },
        })),
        /Invalid JSON/,
    );
});

test('requires an unpublished version to advance the latest tag', async () => {
    const response = (latest) => async () => ({
        status: 200,
        json: async () => ({name, versions: {}, 'dist-tags': {latest}}),
    });
    assert.equal(await checkRegistry(version, integrity, response('1.2.2')), false);
    for (const latest of ['1.2.3', '1.2.4', '9.0.0']) {
        await assert.rejects(checkRegistry(version, integrity, response(latest)), /must be newer/);
    }
    for (const latest of [undefined, 'invalid']) {
        await assert.rejects(
            checkRegistry(version, integrity, response(latest)),
            /missing or invalid/,
        );
    }
});

test('verifies actual archive bytes against npm pack integrity', () => {
    const bytes = Buffer.from('package archive bytes');
    const digest = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    validateTarball(bytes, digest);
    assert.throws(
        () => validateTarball(Buffer.from('tampered archive'), digest),
        /bytes do not match/,
    );
});

test('requires the published version to exist during post-publish confirmation', async () => {
    for (const response of [
        {status: 404},
        {status: 200, json: async () => ({name, versions: {}, 'dist-tags': {latest: '1.2.2'}})},
    ]) {
        await assert.rejects(
            checkRegistry(version, integrity, async () => response, true),
            /not yet available/,
        );
    }
    assert.equal(
        await checkRegistry(
            version,
            integrity,
            async () => ({
                status: 200,
                json: async () => ({name, versions: {[version]: {dist: {integrity}}}}),
            }),
            true,
        ),
        true,
    );
});
