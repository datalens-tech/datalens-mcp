import Ajv from 'ajv';
import type {ErrorObject, ValidateFunction} from 'ajv';

import {GatewayError} from '../../../utils';
import type {JsonSchema} from '../../openapi';

const ajv = new Ajv({
    allErrors: true,
    allowUnionTypes: true,
    strict: false,
    validateFormats: false,
});

const formatValidationErrors = (errors: ErrorObject[] | null | undefined): unknown[] =>
    (errors ?? []).map(({instancePath, keyword, message, params}) => ({
        path: instancePath || '/',
        keyword,
        message,
        params,
    }));

export const compileParameterValidator = (
    schema: JsonSchema,
    commandName: string,
): ((parameters: Record<string, unknown>) => void) => {
    let validate: ValidateFunction;
    try {
        validate = ajv.compile(schema);
    } catch (error) {
        throw new GatewayError(`Failed to compile input schema for command ${commandName}`, {
            kind: 'schema',
            code: 'COMMAND_SCHEMA_COMPILE_FAILED',
            details: {cause: error},
        });
    }

    return (parameters) => {
        if (!validate(parameters)) {
            throw new GatewayError(`Invalid parameters for command ${commandName}`, {
                kind: 'validation',
                code: 'INVALID_COMMAND_PARAMETERS',
                details: {errors: formatValidationErrors(validate.errors)},
            });
        }
    };
};
