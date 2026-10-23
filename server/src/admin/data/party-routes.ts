import express from 'express';
import PartyUsageModel from '../../models/PartyUsageModel';
import { wsHandler } from '../../socket/setup';
import { asyncRoute, boundedInteger } from '../common';

const router = express.Router();

router.get(
    '/parties',
    asyncRoute(async (req, res) => {
        const days = req.query.days === undefined ? 30 : boundedInteger(req.query.days, 1, 180, 'days');
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const since = new Date(today);
        since.setUTCDate(since.getUTCDate() - days + 1);

        const [dailyRows, partyRows] = await Promise.all([
            PartyUsageModel.find({ day: { $gte: since, $lte: today } })
                .select('_id day metrics')
                .sort({ day: 1 })
                .maxTimeMS(5000)
                .lean(),
            Promise.resolve(wsHandler.getActiveTagRooms()),
        ]);

        const parties = partyRows
            .map((party) => {
                const members = party.members
                    .filter((member) => member.ws.readyState === 1)
                    .map((member) => ({
                        nick: member.nick || 'Unnamed',
                        score: member.score,
                        isAlive: member.isAlive,
                        ping: member.ping,
                    }));
                return { tag: party.tag, server: party.server, members, memberCount: members.length };
            })
            .filter((party) => party.members.length > 0)
            .sort((a, b) => b.memberCount - a.memberCount || a.tag.localeCompare(b.tag) || a.server.localeCompare(b.server));

        const dailyByDate = new Map(dailyRows.map((row) => [new Date(row.day).toISOString().slice(0, 10), row]));
        const daily = Array.from({ length: days }, (_, index) => {
            const dayDate = new Date(since);
            dayDate.setUTCDate(dayDate.getUTCDate() + index);
            const day = dayDate.toISOString().slice(0, 10);
            const row = dailyByDate.get(day);
            const metrics = (row?.metrics ?? {}) as Record<string, unknown>;
            const buckets = (metrics.sizeBuckets ?? {}) as Record<string, unknown>;
            const value = (key: string) => (typeof metrics[key] === 'number' ? metrics[key] : 0);
            const bucket = (key: string) => (typeof buckets[key] === 'number' ? buckets[key] : 0);
            return {
                day,
                sessionsStarted: value('sessionsStarted'),
                sessionsCompleted: value('sessionsCompleted'),
                durationSeconds: value('durationSeconds'),
                joins: value('joins'),
                leaves: value('leaves'),
                reconnects: value('reconnects'),
                chatMessages: value('chatMessages'),
                sizeBuckets: {
                    one: bucket('one'),
                    twoToFour: bucket('twoToFour'),
                    fiveToNine: bucket('fiveToNine'),
                    tenPlus: bucket('tenPlus'),
                },
            };
        });

        res.json({
            capturedAt: new Date(),
            rangeDays: days,
            hasRecordedUsage: dailyRows.length > 0,
            parties,
            livePartyCount: parties.length,
            liveMemberCount: parties.reduce((total, party) => total + party.memberCount, 0),
            daily,
        });
    })
);

export default router;
