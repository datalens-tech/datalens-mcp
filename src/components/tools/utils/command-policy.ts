import {GatewayError} from '../../../utils';
import type {OpenAPIOperation} from '../../openapi';
import type {CommandPolicy} from '../types';

type ParsedCommandPolicy = CommandPolicy & {enabled: boolean};

const invalidPolicy = (commandName: string, field: string): never => {
    throw new GatewayError(`Invalid x-mcp.${field} for command ${commandName}`, {
        kind: 'schema',
        code: 'INVALID_MCP_POLICY',
    });
};

export const parseCommandPolicy = (
    operation: OpenAPIOperation,
    commandName: string,
): ParsedCommandPolicy => {
    const extension = operation['x-mcp'];
    if (
        extension !== undefined &&
        (extension === null || typeof extension !== 'object' || Array.isArray(extension))
    ) {
        throw new GatewayError(`Invalid x-mcp extension for command ${commandName}`, {
            kind: 'schema',
            code: 'INVALID_MCP_POLICY',
        });
    }

    if (
        operation['x-mcp-disabled'] !== undefined &&
        typeof operation['x-mcp-disabled'] !== 'boolean'
    ) {
        throw new GatewayError(`Invalid x-mcp-disabled for command ${commandName}`, {
            kind: 'schema',
            code: 'INVALID_MCP_POLICY',
        });
    }

    if (extension?.enabled !== undefined && typeof extension.enabled !== 'boolean') {
        invalidPolicy(commandName, 'enabled');
    }
    if (
        extension?.access !== undefined &&
        extension.access !== 'read' &&
        extension.access !== 'write'
    ) {
        invalidPolicy(commandName, 'access');
    }
    if (extension?.destructive !== undefined && typeof extension.destructive !== 'boolean') {
        invalidPolicy(commandName, 'destructive');
    }
    if (extension?.idempotent !== undefined && typeof extension.idempotent !== 'boolean') {
        invalidPolicy(commandName, 'idempotent');
    }

    const access = extension?.access ?? 'unknown';
    const destructive = extension?.destructive ?? false;
    if (access === 'read' && destructive) {
        throw new GatewayError(`Read command ${commandName} cannot be marked as destructive`, {
            kind: 'schema',
            code: 'INVALID_MCP_POLICY',
        });
    }

    return {
        enabled: operation['x-mcp-disabled'] !== true && extension?.enabled !== false,
        access,
        destructive,
        idempotent: extension?.idempotent ?? access === 'read',
    };
};
