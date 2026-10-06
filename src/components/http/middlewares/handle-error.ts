import {randomUUID} from 'crypto';

import type {ErrorRequestHandler} from 'express';

export const handleError: ErrorRequestHandler = (err, _req, res, _next) => {
    const requestId = res.getHeader('x-request-id') ?? randomUUID();

    const status =
        [err?.status, err?.statusCode].find(
            (value) => Number.isInteger(value) && value >= 400 && value <= 599,
        ) ?? 500;

    if (status >= 500) {
        console.error(`MCP HTTP request failed: ${requestId}`);
    }

    if (res.headersSent) {
        res.destroy();
    } else {
        res.setHeader('x-request-id', requestId).status(status).end();
    }
};
