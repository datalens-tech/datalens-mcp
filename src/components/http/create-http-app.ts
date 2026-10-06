import {createMcpExpressApp} from '@modelcontextprotocol/express';
import {toNodeHandler} from '@modelcontextprotocol/node';
import {createMcpHandler} from '@modelcontextprotocol/server';

import {getPackageVersion} from '../../utils';
import {createMcpServer} from '../mcp';
import {loadTools} from '../tools';

import type {HttpConfig} from './config';
import {handleError, notFound, requestLogger} from './middlewares';

const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;

export const createHttpApp = async (config: HttpConfig) => {
    if (config.installation !== 'internal') {
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
                getAuthHeader: (request) => request?.headers.get('authorization') ?? undefined,
            },
        }),
    );

    const nodeHandler = toNodeHandler(handler, {maxRequestBodySize: MAX_REQUEST_BODY_BYTES});

    const app = createMcpExpressApp({host: '0.0.0.0', jsonLimit: '4mb'});
    app.disable('x-powered-by');

    app.use(requestLogger);
    app.get('/ping', (_req, res) => {
        res.type('text/plain').send('OK');
    });

    app.all('/mcp', async (req, res) => {
        await nodeHandler(req, res, req.body);
    });

    app.use(notFound);
    app.use(handleError);

    return {
        app,
        closeMcp: () => handler.close(),
    };
};
