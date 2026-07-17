import {randomUUID} from 'crypto';

import {GatewayError} from '../../../utils';
import type {CollectedTool} from '../types';

type StoredPlan = {
    tool: CollectedTool;
    parameters: Record<string, unknown>;
    expiresAt: number;
};

const MAX_STORED_PLANS = 1_000;

const cloneParameters = (parameters: Record<string, unknown>): Record<string, unknown> =>
    JSON.parse(JSON.stringify(parameters)) as Record<string, unknown>;

export class PlanStore {
    private readonly entries = new Map<string, StoredPlan>();
    private readonly ttlMs: number;

    constructor(ttlMs: number) {
        this.ttlMs = ttlMs;
    }

    create(
        tool: CollectedTool,
        parameters: Record<string, unknown>,
    ): {planId: string; expiresAt: number} {
        this.removeExpired();
        while (this.entries.size >= MAX_STORED_PLANS) {
            const oldestId = this.entries.keys().next().value as string | undefined;
            if (!oldestId) {
                break;
            }
            this.entries.delete(oldestId);
        }

        const planId = randomUUID();
        const expiresAt = Date.now() + this.ttlMs;
        this.entries.set(planId, {
            tool,
            parameters: cloneParameters(parameters),
            expiresAt,
        });
        return {planId, expiresAt};
    }

    take(planId: string): StoredPlan {
        const entry = this.entries.get(planId);
        if (entry && entry.expiresAt <= Date.now()) {
            this.entries.delete(planId);
            throw new GatewayError(`Plan ${planId} has expired`, {
                kind: 'policy',
                code: 'PLAN_EXPIRED',
            });
        }
        if (!entry) {
            throw new GatewayError(`Plan ${planId} was not found or was already used`, {
                kind: 'policy',
                code: 'PLAN_NOT_FOUND',
            });
        }

        // Consume before dispatch. A network failure may be ambiguous and must never replay a write.
        this.entries.delete(planId);
        return entry;
    }

    private removeExpired(now = Date.now()): void {
        for (const [id, entry] of this.entries) {
            if (entry.expiresAt <= now) {
                this.entries.delete(id);
            }
        }
    }
}
