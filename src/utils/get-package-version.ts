import {readFileSync} from 'fs';
import path from 'path';

export const getPackageVersion = (): string => {
    const {version} = JSON.parse(
        readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
    );
    return version;
};
