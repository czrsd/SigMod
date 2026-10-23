import { createHash, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import SettingsUsageModel from '../models/SettingsUsageModel';
import {
    SETTINGS_USAGE_SCHEMA,
    MAX_USAGE_BYTES,
    isRecord,
    validateUsageValues,
    flattenUsageValues,
    nestUsageValues,
    usageChecksum,
} from '../utils/settingsUsage';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validKeys = new Set([
    'installationId',
    'kind',
    'baseRevision',
    'operationId',
    'clientVersion',
    'settingsSchemaVersion',
    'contractVersion',
    'values',
    'checksum',
]);

export const syncSettingsUsage = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    const input: unknown = req.body;
    const writeKey = req.get('X-Settings-Write-Key');
    if (
        !isRecord(input) ||
        Object.keys(input).some((key) => !validKeys.has(key)) ||
        typeof input.installationId !== 'string' ||
        !uuid.test(input.installationId) ||
        typeof writeKey !== 'string' ||
        !/^[0-9a-f]{64}$/.test(writeKey) ||
        !['check', 'snapshot', 'patch'].includes(String(input.kind)) ||
        Buffer.byteLength(JSON.stringify(input)) > MAX_USAGE_BYTES
    ) {
        res.status(400).json({ success: false, message: 'Invalid settings sync request.' });
        return;
    }
    if (mongoose.connection.readyState !== 1) {
        res.status(503).json({ success: false, message: 'Settings sync unavailable.' });
        return;
    }
    const writeKeyHash = createHash('sha256').update(writeKey).digest('hex');
    try {
        const current = await SettingsUsageModel.findById(input.installationId).select('+writeKeyHash').lean();
        if (current && !timingSafeEqual(Buffer.from(current.writeKeyHash, 'hex'), Buffer.from(writeKeyHash, 'hex'))) {
            res.status(403).json({ success: false, message: 'Invalid installation credentials.' });
            return;
        }
        const state = { revision: current?.revision ?? 0, checksum: current?.checksum ?? null };
        if (input.kind === 'check') {
            res.json({ success: true, ...state });
            return;
        }
        const snapshot = input.kind === 'snapshot';
        const values = validateUsageValues(input.values, snapshot);
        if (
            !Number.isSafeInteger(input.baseRevision) ||
            Number(input.baseRevision) < 0 ||
            typeof input.operationId !== 'string' ||
            !uuid.test(input.operationId) ||
            typeof input.clientVersion !== 'string' ||
            !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(input.clientVersion) ||
            input.clientVersion.length > 64 ||
            input.settingsSchemaVersion !== SETTINGS_USAGE_SCHEMA.settingsSchemaVersion ||
            input.contractVersion !== SETTINGS_USAGE_SCHEMA.version ||
            !values ||
            typeof input.checksum !== 'string' ||
            !/^[0-9a-f]{64}$/.test(input.checksum)
        ) {
            res.status(400).json({ success: false, message: 'Invalid settings values or version.' });
            return;
        }
        if (current?.operationId === input.operationId) {
            // A lost response can be retried without incrementing the revision again.
            if (current.revision !== Number(input.baseRevision) + 1 || current.checksum !== input.checksum) {
                res.status(409).json({ success: false, ...state });
                return;
            }
            res.json({ success: true, ...state });
            return;
        }
        if (state.revision !== input.baseRevision || (!current && !snapshot)) {
            res.status(409).json({ success: false, ...state });
            return;
        }
        const merged = snapshot ? values : { ...flattenUsageValues(current!.settings), ...values };
        if (!validateUsageValues(merged, true) || usageChecksum(merged) !== input.checksum) {
            res.status(409).json({ success: false, ...state });
            return;
        }
        const next = {
            revision: state.revision + 1,
            operationId: input.operationId,
            clientVersion: input.clientVersion,
            settingsSchemaVersion: input.settingsSchemaVersion,
            contractVersion: input.contractVersion,
            checksum: input.checksum,
            settings: nestUsageValues(merged),
            lastSyncedAt: new Date(),
        };
        if (!current) {
            await SettingsUsageModel.create({
                _id: input.installationId, writeKeyHash, createdAt: new Date(), ...next,
            });
        } else {
            const result = await SettingsUsageModel.updateOne(
                { _id: input.installationId, writeKeyHash, revision: state.revision },
                { $set: next }
            );
            if (result.modifiedCount !== 1) {
                res.status(409).json({ success: false, message: 'Settings revision changed; reconcile again.' });
                return;
            }
        }
        res.json({ success: true, revision: next.revision, checksum: next.checksum });
    } catch (error) {
        const duplicate = isRecord(error) && error.code === 11000;
        res.status(duplicate ? 409 : 503).json({ success: false, message: 'Settings sync needs retry.' });
    }
};
