import {createHash} from 'node:crypto';
import {appendFileSync, readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import semver from 'semver';

const packageName = '@datalens-tech/mcp';
const requiredFiles = [
    'package.json',
    'README.md',
    'LICENSE',
    'NOTICES',
    'dist/index.js',
    'dist/app.js',
    'dist/utils/get-package-version.js',
];

export function validateVersion(pkg, lock, expected) {
    const version = pkg.version;
    if (
        typeof version !== 'string' ||
        semver.valid(version) !== version ||
        semver.prerelease(version)
    ) {
        throw new Error('Package version must be a canonical stable semantic version');
    }
    if (version !== expected) {
        throw new Error(`Expected version ${expected}, found ${version}`);
    }
    if (
        pkg.name !== packageName ||
        lock.name !== packageName ||
        lock.packages?.['']?.name !== packageName
    ) {
        throw new Error(`Package and lockfile names must be ${packageName}`);
    }
    if (lock.version !== version || lock.packages?.['']?.version !== version) {
        throw new Error('Package and lockfile versions must match');
    }
    if (pkg.private || pkg.publishConfig?.access !== 'public') {
        throw new Error('Package must be configured for public publishing');
    }
    if (pkg.main !== 'dist/index.js' || pkg.bin?.['datalens-mcp'] !== './dist/index.js') {
        throw new Error('Package main and CLI entrypoints must reference dist/index.js');
    }
    return version;
}

export function validatePack(packs, version) {
    if (!Array.isArray(packs) || packs.length !== 1) {
        throw new Error('npm pack must produce exactly one package');
    }
    const pack = packs[0];
    if (pack.name !== packageName || pack.version !== version) {
        throw new Error('Packed package name or version does not match');
    }
    if (pack.filename !== `datalens-tech-mcp-${version}.tgz`) {
        throw new Error('Unexpected package tarball filename');
    }
    if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(pack.integrity)) {
        throw new Error('Packed package must have SHA512 integrity');
    }
    if (!Array.isArray(pack.files)) {
        throw new Error('Packed package file list is missing');
    }
    const paths = pack.files.map((file) => file.path);
    for (const path of paths) {
        const compiledFile =
            typeof path === 'string' &&
            /^dist\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.js$/.test(path);
        if (
            (!requiredFiles.includes(path) && !compiledFile) ||
            /(?:^|\/)(?:__tests__|tests?)(?:\/|\.)|\.(?:test|spec)\.js$/.test(path)
        ) {
            throw new Error(`Unexpected file in packed package: ${path}`);
        }
    }
    for (const path of requiredFiles) {
        if (!paths.includes(path)) {
            throw new Error(`Required file is missing from packed package: ${path}`);
        }
    }
    return pack;
}

export function validateTarball(bytes, integrity) {
    const actual = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    if (actual !== integrity) {
        throw new Error('Package tarball bytes do not match npm pack integrity');
    }
}

export async function checkRegistry(
    version,
    integrity,
    fetchRegistry = fetch,
    requirePublished = false,
) {
    const response = await fetchRegistry('https://registry.npmjs.org/@datalens-tech%2fmcp', {
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
        headers: {Accept: 'application/vnd.npm.install-v1+json'},
    });
    if (response.status === 404) {
        if (requirePublished) {
            throw new Error('Published version is not yet available in npm registry');
        }
        return false;
    }
    if (response.status !== 200) {
        throw new Error(`npm registry returned HTTP ${response.status}`);
    }
    const metadata = await response.json();
    if (
        metadata.name !== packageName ||
        !metadata.versions ||
        typeof metadata.versions !== 'object'
    ) {
        throw new Error('npm registry returned invalid package metadata');
    }
    const published = metadata.versions[version];
    if (published) {
        if (published.dist?.integrity !== integrity) {
            throw new Error('Published version does not match the packed package integrity');
        }
        return true;
    }
    if (requirePublished) {
        throw new Error('Published version is not yet available in npm registry');
    }
    const latest = metadata['dist-tags']?.latest;
    if (typeof latest !== 'string' || semver.valid(latest) !== latest) {
        throw new Error('npm registry latest version is missing or invalid');
    }
    if (!semver.gt(version, latest)) {
        throw new Error(`New version ${version} must be newer than npm latest ${latest}`);
    }
    return false;
}

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function output(values) {
    if (!process.env.GITHUB_OUTPUT) {
        throw new Error('GITHUB_OUTPUT is required');
    }
    appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries(values)
            .map(([key, value]) => `${key}=${value}\n`)
            .join(''),
    );
}

async function main(command) {
    const pkg = readJson('package.json');
    if (command === 'version') {
        const version = validateVersion(
            pkg,
            readJson('package-lock.json'),
            process.env.EXPECTED_VERSION,
        );
        output({version, tag: `v${version}`});
    } else if (command === 'pack' || command === 'registry') {
        const pack = validatePack(readJson('pack.json'), pkg.version);
        validateTarball(readFileSync(pack.filename), pack.integrity);
        if (command === 'pack') {
            output({tarball: pack.filename, integrity: pack.integrity});
        } else {
            output({
                published: await checkRegistry(
                    pkg.version,
                    pack.integrity,
                    fetch,
                    process.argv.includes('--require-published'),
                ),
            });
        }
    } else {
        throw new Error('Expected command: version, pack, or registry');
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv[2]).catch((error) => {
        console.error(`Release validation failed: ${error.message}`);
        process.exitCode = 1;
    });
}
