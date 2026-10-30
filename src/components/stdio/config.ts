import {loadConfig} from '../config';
import type {AppConfig} from '../config';

export type {YcIamConfig} from '../config';
export type StdioConfig = AppConfig;

export const loadStdioConfig = (): StdioConfig => loadConfig();
