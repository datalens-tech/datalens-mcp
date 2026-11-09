import {once} from 'events';
import type {Server} from 'http';
import type {AddressInfo} from 'net';

import {onTestFinished} from 'vitest';

export const listenHttp = async (server: Server): Promise<URL> => {
    onTestFinished(async () => {
        const closed = new Promise<void>((resolve) => server.close(() => resolve()));
        server.closeAllConnections();
        await closed;
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
};
