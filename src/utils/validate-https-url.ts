export const validateHttpsUrl = (value: string, name: string): void => {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${name} must be a valid HTTPS URL`);
    }
    const isLocalHttp =
        process.env.NODE_ENV === 'development' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((!isLocalHttp && url.protocol !== 'https:') || url.username || url.password) {
        throw new Error(
            `${name} must use HTTPS without embedded credentials; local HTTP is allowed only in development`,
        );
    }
};
