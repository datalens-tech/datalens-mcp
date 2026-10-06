const assert = require('node:assert/strict');
const {test} = require('node:test');
const release = require('./github-release.cjs');

function fixture({ref, existing, refError, releaseError, annotated} = {}) {
    const created = [];
    const context = {repo: {owner: 'datalens-tech', repo: 'datalens-mcp'}, sha: 'checked-commit'};
    const github = {
        rest: {
            git: {
                async getRef() {
                    if (refError) throw refError;
                    if (!ref) throw Object.assign(new Error('Not found'), {status: 404});
                    return {data: {object: ref}};
                },
                async getTag() {
                    return {data: {object: annotated}};
                },
            },
            repos: {
                async getReleaseByTag() {
                    if (releaseError) throw releaseError;
                    if (!existing) throw Object.assign(new Error('Not found'), {status: 404});
                    return {data: existing};
                },
                async createRelease(input) {
                    created.push(input);
                    return {data: {html_url: 'https://example.com/release'}};
                },
            },
        },
    };
    return {github, context, version: '0.2.0', created};
}

test('preflight does not create a tag or release', async () => {
    const input = fixture();
    await release(input);
    assert.deepEqual(input.created, []);
});

test('release targets the checked commit and uses generated notes', async () => {
    const input = fixture();
    await release({...input, create: true});
    assert.deepEqual(input.created, [
        {
            owner: 'datalens-tech',
            repo: 'datalens-mcp',
            tag_name: 'v0.2.0',
            target_commitish: 'checked-commit',
            name: 'v0.2.0',
            generate_release_notes: true,
            make_latest: 'legacy',
        },
    ]);
});

test('retry completes a release for an existing matching tag', async () => {
    const input = fixture({ref: {type: 'commit', sha: 'checked-commit'}});
    await release({...input, create: true});
    assert.equal(input.created.length, 1);
});

test('existing stable release is preserved on retry', async () => {
    const input = fixture({
        ref: {type: 'tag', sha: 'annotated-tag'},
        annotated: {type: 'commit', sha: 'checked-commit'},
        existing: {draft: false, prerelease: false, html_url: 'https://example.com/release'},
    });
    await release({...input, create: true});
    assert.deepEqual(input.created, []);
});

test('conflicting tag blocks publishing and release creation', async () => {
    const input = fixture({ref: {type: 'commit', sha: 'different-commit'}});
    await assert.rejects(
        release({...input, create: true}),
        /does not point to the workflow commit/,
    );
    assert.deepEqual(input.created, []);
});

test('unstable release metadata is rejected when returned by GitHub', async () => {
    const input = fixture({ref: {type: 'commit', sha: 'checked-commit'}, existing: {draft: true}});
    await assert.rejects(release(input), /published stable release/);
});

test('GitHub permission and server errors are not treated as missing objects', async () => {
    for (const status of [403, 500]) {
        await assert.rejects(
            release(fixture({refError: Object.assign(new Error('API failure'), {status})})),
            /API failure/,
        );
        await assert.rejects(
            release(fixture({releaseError: Object.assign(new Error('API failure'), {status})})),
            /API failure/,
        );
    }
});
