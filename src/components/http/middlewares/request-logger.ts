import {randomUUID} from 'crypto';

import type {RequestHandler} from 'express';

import {HTTP_HEADER} from '../../../constants/http';

export const requestLogger: RequestHandler = (req, res, next) => {
    const startedAt = performance.now();
    const requestId = randomUUID();
    res.setHeader(HTTP_HEADER.REQUEST_ID, requestId);

    const message = `${req.method} ${req.path} requestId=${requestId}`;

    console.info(`START ${message}`);
    res.once('finish', () => {
        const durationMs = Math.round(performance.now() - startedAt);
        console.info(`[${res.statusCode}][${durationMs}ms] FINISH ${message}`);
    });
    next();
};
