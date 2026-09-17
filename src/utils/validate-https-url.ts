export const validateHttpsUrl = (value: string, name: string): void => {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${name} must be a valid HTTPS URL`);
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
        throw new Error(`${name} must be an HTTPS URL without embedded credentials`);
    }
};
