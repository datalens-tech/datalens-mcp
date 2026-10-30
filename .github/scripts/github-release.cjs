module.exports = async function githubRelease({github, context, version, create = false}) {
    const {owner, repo} = context.repo;
    const tag = `v${version}`;
    let ref;
    try {
        ref = (await github.rest.git.getRef({owner, repo, ref: `tags/${tag}`})).data;
    } catch (error) {
        if (error.status !== 404) throw error;
    }
    if (ref) {
        let object = ref.object;
        for (let depth = 0; object.type === 'tag' && depth < 10; depth++) {
            object = (await github.rest.git.getTag({owner, repo, tag_sha: object.sha})).data.object;
        }
        if (object.type !== 'commit' || object.sha !== context.sha) {
            throw new Error(`Tag ${tag} does not point to the workflow commit ${context.sha}`);
        }
    }

    let existing;
    try {
        existing = (await github.rest.repos.getReleaseByTag({owner, repo, tag})).data;
    } catch (error) {
        if (error.status !== 404) throw error;
    }
    if (existing) {
        if (!ref || existing.draft || existing.prerelease) {
            throw new Error(
                `Release ${tag} must be a published stable release with a matching tag`,
            );
        }
        console.log(`Release ${tag} already exists: ${existing.html_url}`);
        return;
    }
    if (create) {
        const {data} = await github.rest.repos.createRelease({
            owner,
            repo,
            tag_name: tag,
            target_commitish: context.sha,
            name: tag,
            generate_release_notes: true,
            make_latest: 'legacy',
        });
        console.log(`Created release ${tag}: ${data.html_url}`);
    }
};
