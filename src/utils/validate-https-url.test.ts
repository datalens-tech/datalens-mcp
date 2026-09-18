import {afterEach, describe, expect, it, vi} from 'vitest';

import {validateHttpsUrl} from './validate-https-url';

describe('validateHttpsUrl', () => {
    afterEach(() => vi.unstubAllEnvs());

    it.each([
        'https://api.example.com/v2/',
        'http://localhost:8080/json/',
        'http://127.0.0.1:8080/v2/',
        'http://[::1]:8080/v2/',
    ])('allows HTTPS and local HTTP: %s', (url) => {
        vi.stubEnv('NODE_ENV', 'development');
        expect(() => validateHttpsUrl(url, 'URL')).not.toThrow();
    });

    it.each([
        'http://api.example.com/',
        'http://localhost.example.com/',
        'http://127.0.0.1.example.com/',
        'http://[::ffff:127.0.0.1]/',
        'https://user:password@api.example.com/',
        'http://user:password@localhost/',
        'ftp://localhost/',
        'not a URL',
    ])('rejects remote HTTP, credentials and invalid URLs: %s', (url) => {
        vi.stubEnv('NODE_ENV', 'development');
        expect(() => validateHttpsUrl(url, 'URL')).toThrow();
    });

    it.each(['production', 'test', undefined])(
        'requires HTTPS outside development: %s',
        (environment) => {
            vi.stubEnv('NODE_ENV', environment);
            for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
                expect(() => validateHttpsUrl(`http://${hostname}:8080/`, 'URL')).toThrow();
                expect(() => validateHttpsUrl(`https://${hostname}:8080/`, 'URL')).not.toThrow();
            }
        },
    );
});
