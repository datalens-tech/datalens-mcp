import type {RequestHandler} from 'express';

export const notFound: RequestHandler = (_req, res) => {
    res.status(404).end();
};
