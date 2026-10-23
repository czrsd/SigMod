import { isValidObjectId } from 'mongoose';
import FriendModel from '../models/FriendModel';
import RequestModel from '../models/RequestModel';
import AccountModel from '../models/AccountModel';
import UserSettingsModel from '../models/UserSettingsModel';
import { HttpError } from '../admin/common';

const pending = new Map<string, Promise<unknown>>();

async function withPair<T>(userId: string, targetId: string, action: () => Promise<T>): Promise<T> {
    if (!isValidObjectId(userId) || !isValidObjectId(targetId) || userId === targetId) throw new HttpError(400, 'Invalid friend target.');
    const key = [userId, targetId].sort().join(':');
    const previous = pending.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(action);
    pending.set(key, current);
    try {
        return await current;
    } finally {
        if (pending.get(key) === current) pending.delete(key);
    }
}

export const sendFriendRequest = (sender: string, recipient: string) =>
    withPair(sender, recipient, async () => {
        const target = await AccountModel.exists({ _id: recipient, merged_into: { $exists: false } });
        if (!target) throw new HttpError(404, 'User does not exist.');
        const settings = await UserSettingsModel.findOne({ target: recipient });
        if (!settings?.accept_requests) throw new HttpError(400, "User doesn't accept friend requests.");
        if (await FriendModel.exists({ user_id: sender, friend_id: recipient })) throw new HttpError(409, 'You are already friends.');
        if (await RequestModel.exists({ req_id: sender, target_id: recipient }))
            throw new HttpError(409, 'This user has already sent you a friend request.');
        try {
            await RequestModel.updateOne(
                { req_id: recipient, target_id: sender },
                { $setOnInsert: { req_id: recipient, target_id: sender } },
                { upsert: true }
            );
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) throw error;
        }
    });

export const handleFriendRequest = (userId: string, targetId: string, type: string) =>
    withPair(userId, targetId, async () => {
        if (type === 'remove-friend') {
            await FriendModel.deleteMany({
                $or: [
                    { user_id: userId, friend_id: targetId },
                    { user_id: targetId, friend_id: userId },
                ],
            });
            await RequestModel.deleteMany({
                $or: [
                    { req_id: userId, target_id: targetId },
                    { req_id: targetId, target_id: userId },
                ],
            });
            return;
        }
        if (type !== 'accept-request' && type !== 'decline-request') throw new HttpError(400, 'Unknown request type.');
        const request = { req_id: userId, target_id: targetId };
        if (!(await RequestModel.exists(request))) {
            if (
                type === 'accept-request' &&
                (await FriendModel.exists({ user_id: userId, friend_id: targetId })) &&
                (await FriendModel.exists({ user_id: targetId, friend_id: userId }))
            )
                return;
            throw new HttpError(404, 'Friend request not found.');
        }
        if (type === 'accept-request') {
            if (!(await AccountModel.exists({ _id: targetId, merged_into: { $exists: false } })))
                throw new HttpError(404, 'User does not exist.');
            for (const [user, friend] of [
                [userId, targetId],
                [targetId, userId],
            ]) {
                try {
                    await FriendModel.updateOne(
                        { user_id: user, friend_id: friend },
                        { $setOnInsert: { user_id: user, friend_id: friend, timestamp: new Date() } },
                        { upsert: true }
                    );
                } catch (error) {
                    if ((error as { code?: number }).code !== 11000) throw error;
                }
            }
            await RequestModel.deleteMany({ $or: [request, { req_id: targetId, target_id: userId }] });
        } else await RequestModel.deleteOne(request);
    });
