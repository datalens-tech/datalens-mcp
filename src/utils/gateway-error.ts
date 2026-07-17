export type GatewayErrorKind =
    | 'configuration'
    | 'schema'
    | 'auth'
    | 'timeout'
    | 'network'
    | 'api'
    | 'validation'
    | 'policy'
    | 'result'
    | 'internal';

type GatewayErrorOptions = {
    kind: GatewayErrorKind;
    code: string;
    retryable?: boolean;
    status?: number;
    requestId?: string;
    details?: unknown;
};

export class GatewayError extends Error {
    readonly kind: GatewayErrorKind;
    readonly code: string;
    readonly retryable: boolean;
    readonly status?: number;
    readonly requestId?: string;
    readonly details?: unknown;

    constructor(message: string, options: GatewayErrorOptions) {
        super(message);
        this.name = 'GatewayError';
        this.kind = options.kind;
        this.code = options.code;
        this.retryable = options.retryable ?? false;
        this.status = options.status;
        this.requestId = options.requestId;
        this.details = options.details;
    }
}

const SENSITIVE_KEY =
    /authorization|proxy-authorization|cookie|set-cookie|token|secret|password|passwd|credential|api[-_]?key/i;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const INLINE_SECRET =
    /\b(authorization|token|secret|password|credential|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi;
const MAX_ERROR_DETAILS_CHARS = 4_000;

export const redactText = (value: string): string =>
    value
        .replace(BEARER_VALUE, 'Bearer [REDACTED]')
        .replace(JWT_VALUE, '[REDACTED]')
        .replace(INLINE_SECRET, '$1=[REDACTED]');

const redactValue = (value: unknown, seen: WeakSet<object>, depth: number): unknown => {
    if (typeof value === 'string') {
        return redactText(value);
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (depth >= 10) {
        return '[MAX_DEPTH]';
    }
    if (seen.has(value)) {
        return '[CIRCULAR]';
    }
    seen.add(value);

    if (value instanceof Error) {
        return {name: value.name, message: redactText(value.message)};
    }
    if (Array.isArray(value)) {
        return value.map((item) => redactValue(item, seen, depth + 1));
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
            key,
            SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactValue(item, seen, depth + 1),
        ]),
    );
};

export const redactSensitive = (value: unknown): unknown =>
    redactValue(value, new WeakSet<object>(), 0);

export const toSafeErrorMessage = (error: unknown): string =>
    redactText(error instanceof Error ? error.message : String(error));

export type SerializedGatewayError = {
    code: string;
    kind: GatewayErrorKind;
    message: string;
    retryable: boolean;
    status?: number;
    request_id?: string;
    details?: unknown;
};

const limitDetails = (details: unknown): unknown => {
    const redacted = redactSensitive(details);
    const serialized = JSON.stringify(redacted);
    if (serialized.length <= MAX_ERROR_DETAILS_CHARS) {
        return redacted;
    }
    return `${serialized.slice(0, MAX_ERROR_DETAILS_CHARS)}…[truncated]`;
};

export const serializeGatewayError = (error: unknown): SerializedGatewayError => {
    const gatewayError =
        error instanceof GatewayError
            ? error
            : new GatewayError(toSafeErrorMessage(error), {
                  kind: 'internal',
                  code: 'INTERNAL_ERROR',
              });

    return {
        code: gatewayError.code,
        kind: gatewayError.kind,
        message: redactText(gatewayError.message),
        retryable: gatewayError.retryable,
        ...(gatewayError.status === undefined ? {} : {status: gatewayError.status}),
        ...(gatewayError.requestId ? {request_id: redactText(gatewayError.requestId)} : {}),
        ...(gatewayError.details === undefined
            ? {}
            : {details: limitDetails(gatewayError.details)}),
    };
};
