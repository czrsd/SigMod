import { Request, Response } from 'express';
import AccountModel from '../../../models/AccountModel';
import ChatModel from '../../../models/ChatModel';
import logger from '../../../utils/logger';
import FriendModel from '../../../models/FriendModel';
import { wsHandler } from '../../../socket/setup';
import RequestModel from '../../../models/RequestModel';
import { noXSS } from '../../../utils/helpers';
import { validateUsername } from '../../../utils/validation';
import UserSettingsModel from '../../../models/UserSettingsModel';
import { handleFriendRequest } from '../../../services/friendships';
import { HttpError } from '../../../admin/common';
import { ensureAccountSettings } from '../../../services/discordAccount';

class ProfileController {
    constructor() {
        this.getFriends = this.getFriends.bind(this);
        this.getRequests = this.getRequests.bind(this);
        this.getChatHistory = this.getChatHistory.bind(this);
        this.updateProfile = this.updateProfile.bind(this);
        this.handleRequests = this.handleRequests.bind(this);
        this.updateSettings = this.updateSettings.bind(this);
    }

    async getFriends(req: Request, res: Response): Promise<Response | void> {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'User ID is missing.' });

        try {
            const friendDocs = await FriendModel.find({ user_id: userId });
            const friendIds = friendDocs.map((doc) => doc.friend_id.toString());

            const friendAccounts = await AccountModel.find({
                _id: { $in: friendIds },
            }).select('_id username imageURL role bio badges online lastOnline visible create_time');

            const onlineFriends = wsHandler.onlineFriends(friendIds).filter((friend) => friend.modUser?._id);

            const friends = friendAccounts.map((account) => {
                const accObj = account.toObject();
                const live = onlineFriends.find((online) => online.modUser?._id?.toString() === account._id.toString());
                const isOnline = Boolean(live);
                return {
                    ...accObj,
                    online: isOnline,
                    ...(live ? { nick: live.nick, server: live.server, tag: live.tag } : {}),
                };
            });

            return res.json({ success: true, friends });
        } catch (e) {
            logger.error('An error occurred while fetching friends: ', e);
            return res.status(500).json({
                success: false,
                message: 'An error occurred while fetching friends.',
            });
        }
    }

    async getRequests(req: Request, res: Response): Promise<Response | void> {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'User ID is missing.' });

        try {
            const requestDocs = await RequestModel.find({ req_id: userId });
            const targetIds = requestDocs.map((request) => request.target_id);

            const requests = await AccountModel.find({
                _id: { $in: targetIds },
            }).select('_id username imageURL role bio badges online lastOnline visible create_time');

            return res.status(200).json({ success: true, body: requests });
        } catch (e) {
            logger.error('An error occurred while fetching requests: ', e);
            return res.status(500).json({
                success: false,
                message: 'An error occurred while fetching requests.',
            });
        }
    }

    async getChatHistory(req: Request, res: Response): Promise<Response | void> {
        const { id: targetId } = req.params;
        if (!targetId) return res.status(400).json({ success: false, message: 'No target provided.' });

        const userId = req.user?.userId;

        try {
            if (!(await FriendModel.exists({ user_id: userId, friend_id: targetId })))
                return res.status(403).json({ success: false, message: 'Only friends can open a private chat.' });
            const [myProfile, targetProfile] = await Promise.all([
                AccountModel.findById(userId),
                AccountModel.findById(targetId).select('_id username imageURL role bio badges online lastOnline visible create_time'),
            ]);

            if (!myProfile || !targetProfile) return res.status(404).json({ success: false, message: 'User not found.' });

            const chatHistory = await ChatModel.find({
                $or: [
                    { sender_id: myProfile._id, target_id: targetProfile._id },
                    { sender_id: targetProfile._id, target_id: myProfile._id },
                ],
            })
                .sort({ timestamp: -1 })
                .limit(100);
            chatHistory.reverse();

            return res.status(200).json({
                success: true,
                history: chatHistory,
                target: targetProfile,
            });
        } catch (e) {
            logger.error('Error fetching chat history: ', e);
            return res.status(500).json({
                success: false,
                message: 'An error occurred while fetching chat history.',
            });
        }
    }

    async updateProfile(req: Request, res: Response): Promise<Response | void> {
        const { changes, data } = req.body ?? {};
        if (
            !Array.isArray(changes) ||
            !changes.length ||
            changes.length > 2 ||
            !changes.every((change) => change === 'username' || change === 'bio') ||
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data)
        )
            return res.status(400).json({ success: false, message: 'Invalid profile changes.' });
        try {
            const user = await AccountModel.findById(req.user?.userId);
            if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
            const updates: Record<string, string> = {};
            if (changes.includes('username')) {
                if (typeof data.username !== 'string') return res.status(400).json({ success: false, message: 'Invalid username.' });
                const username = noXSS(data.username.trim());
                const validation = validateUsername(username);
                if (typeof validation === 'string') return res.status(400).json({ success: false, message: validation });
                updates.username = username;
            }
            if (changes.includes('bio')) {
                if (typeof data.bio !== 'string') return res.status(400).json({ success: false, message: 'Invalid bio.' });
                const bio = noXSS(data.bio.trim());
                if (bio.length > 250 || (user.role === 'Member' && /https?:\/\/|www\.|\.com|\.gg/i.test(bio)))
                    return res.status(400).json({ success: false, message: 'Bio is too long or contains a restricted link.' });
                updates.bio = bio;
            }
            const updatedUser = await AccountModel.findOneAndUpdate({ _id: user._id }, { $set: updates }, { new: true }).select(
                '-password'
            );
            for (const socket of wsHandler.sockets.values()) {
                if (socket.modUser?._id?.toString() === user._id.toString()) Object.assign(socket.modUser, updates);
            }
            return res.json({ success: true, user: updatedUser });
        } catch (error) {
            const duplicate = (error as { code?: number }).code === 11000;
            return res
                .status(duplicate ? 409 : 503)
                .json({ success: false, message: duplicate ? 'Username is already taken.' : 'Unable to update profile.' });
        }
    }

    async handleRequests(req: Request, res: Response): Promise<Response | void> {
        const { type, userId: target } = req.body ?? {};
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized.' });
        if (typeof type !== 'string' || typeof target !== 'string')
            return res.status(400).json({ success: false, message: 'Invalid friend action.' });
        try {
            await handleFriendRequest(userId, target, type);
            return res.json({ success: true });
        } catch (error) {
            return res
                .status(error instanceof HttpError ? error.status : 503)
                .json({ success: false, message: error instanceof HttpError ? error.message : 'Unable to update friendship.' });
        }
    }

    async updateSettings(req: Request, res: Response): Promise<Response | void> {
        const { type, data } = req.body ?? {};
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized.' });
        const valid =
            (type === 'static_status' && ['online', 'offline'].includes(data)) ||
            (['accept_requests', 'highlight_friends', 'visible'].includes(type) && typeof data === 'boolean') ||
            (type === 'highlight_color' && typeof data === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(data));
        if (!valid) return res.status(400).json({ success: false, message: 'Invalid friend setting.' });
        try {
            await ensureAccountSettings(userId);
            if (type === 'visible') await AccountModel.updateOne({ _id: userId }, { $set: { visible: data } });
            else await UserSettingsModel.updateOne({ target: userId }, { $set: { [type]: data } });
            if (type === 'static_status') {
                for (const socket of wsHandler.sockets.values()) {
                    if (socket.modUser?._id?.toString() === userId) socket.modUser.online = data === 'online';
                }
                await AccountModel.updateOne(
                    { _id: userId },
                    { $set: { online: wsHandler.onlineFriends([userId]).length > 0, lastOnline: data === 'offline' ? new Date() : null } }
                );
            }
            return res.json({ success: true });
        } catch {
            return res.status(503).json({ success: false, message: 'Unable to update friend setting.' });
        }
    }
}

export default new ProfileController();
