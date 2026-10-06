export const HTTP_HEADER = {
    AUTHORIZATION: 'Authorization',
    CONTENT_TYPE: 'content-type',
    REQUEST_ID: 'x-request-id',
    DATALENS_API_VERSION: 'x-dl-api-version',
    DATALENS_ORG_ID: 'x-dl-org-id',
} as const;

export const CONTENT_TYPE = {
    JSON: 'application/json',
    TEXT: 'text/plain',
} as const;

export const HTTP_STATUS = {
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
} as const;
