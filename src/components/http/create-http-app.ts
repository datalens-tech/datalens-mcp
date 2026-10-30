import {createMcpExpressApp} from '@modelcontextprotocol/express';
import {toNodeHandler} from '@modelcontextprotocol/node';
import {createMcpHandler} from '@modelcontextprotocol/server';

import {CONTENT_TYPE, HTTP_HEADER} from '../../constants/http';
import {getPackageVersion} from '../../utils';
import {INSTALLATION} from '../config';
import {createMcpServer} from '../mcp';
import {loadTools} from '../tools';

import type {HttpConfig} from './config';
import {HTTP_HOST, HTTP_PATH, MAX_REQUEST_BODY_BYTES} from './constants';
import {handleError, notFound, requestLogger} from './middlewares';

export const createHttpApp = async (config: HttpConfig) => {
    if (config.installation !== INSTALLATION.INTERNAL) {
        throw new Error('HTTP transport requires DATALENS_INSTALLATION=internal');
    }

    const tools = await loadTools(config);
    const packageVersion = getPackageVersion();

    const handler = createMcpHandler(() =>
        createMcpServer({
            packageVersion,
            tools,
            maxResponseChars: config.maxResponseChars,
            authProvider: {
                getAuthHeader: (request) =>
                    request?.headers.get(HTTP_HEADER.AUTHORIZATION) ?? undefined,
            },
        }),
    );

    const nodeHandler = toNodeHandler(handler, {maxRequestBodySize: MAX_REQUEST_BODY_BYTES});

    const app = createMcpExpressApp({
        host: HTTP_HOST,
        jsonLimit: String(MAX_REQUEST_BODY_BYTES),
    });

    app.use(requestLogger);
    app.get(HTTP_PATH.PING, (_req, res) => {
        res.type(CONTENT_TYPE.TEXT).send('OK');
    });

    app.all(HTTP_PATH.MCP, async (req, res) => {
        await nodeHandler(req, res, req.body);
    });

    app.use(notFound);
    app.use(handleError);

    return app;
};
