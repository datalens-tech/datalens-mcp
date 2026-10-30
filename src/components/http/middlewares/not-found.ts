import type {RequestHandler} from 'express';

import {HTTP_STATUS} from '../../../constants/http';

export const notFound: RequestHandler = (_req, res) => {
    res.status(HTTP_STATUS.NOT_FOUND).end();
};
