import fs from 'fs';
import path from 'path';

const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {version?: unknown};

if (typeof packageJson.version !== 'string' || !packageJson.version) {
    throw new Error(`Invalid package version in ${packageJsonPath}`);
}

export const PACKAGE_VERSION = packageJson.version;
