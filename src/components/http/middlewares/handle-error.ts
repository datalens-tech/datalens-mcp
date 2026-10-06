import {randomUUID} from 'crypto';

import type {ErrorRequestHandler} from 'express';

import {HTTP_HEADER, HTTP_STATUS} from '../../../constants/http';

const MAX_HTTP_ERROR_STATUS = 599;

export const handleError: ErrorRequestHandler = (err, _req, res, _next) => {
    const requestId = res.getHeader(HTTP_HEADER.REQUEST_ID) ?? randomUUID();

    const status =
        [err?.status, err?.statusCode].find(
            (value) =>
                Number.isInteger(value) &&
                value >= HTTP_STATUS.BAD_REQUEST &&
                value <= MAX_HTTP_ERROR_STATUS,
        ) ?? HTTP_STATUS.INTERNAL_SERVER_ERROR;

    if (status >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
        console.error(`MCP HTTP request failed: ${requestId}`);
    }

    if (res.headersSent) {
        res.destroy();
    } else {
        res.setHeader(HTTP_HEADER.REQUEST_ID, requestId).status(status).end();
    }
};
