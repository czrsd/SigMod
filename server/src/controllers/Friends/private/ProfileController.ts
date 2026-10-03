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

class ProfileController {
    constructor() {
        this.getFriends = this.getFriends.bind(this);
        this.getRequests = this.getRequests.bind(this);
        this.getChatHistory = this.getChatHistory.bind(this);
        this.updateProfile = this.updateProfile.bind(this);
        this.handleRequests = this.handleRequests.bind(this);
        this.updateSettings = this.updateSettings.bind(this);
    }

    // GET Friends
    async getFriends(req: Request, res: Response): Promise<Response | void> {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'User ID is missing.' });

        try {
            const friendDocs = await FriendModel.find({ user_id: userId });
            const friendIds = friendDocs.map((doc) => doc.friend_id.toString());

            // Single batch query instead of N+1 individual queries
            const friendAccounts = await AccountModel.find({
                _id: { $in: friendIds },
            }).select('-password');

            const onlineFriends = wsHandler.onlineFriends(friendIds).filter((friend) => friend.modUser?._id);

            const friends = friendAccounts.map((account) => {
                const accObj = account.toObject();
                const isOnline = onlineFriends.some((online) => online.modUser?._id?.toString() === account._id.toString());
                return {
                    ...accObj,
                    online: isOnline,
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

    // GET Requests
    async getRequests(req: Request, res: Response): Promise<Response | void> {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'User ID is missing.' });

        try {
            const requestDocs = await RequestModel.find({ req_id: userId });
            const targetIds = requestDocs.map((request) => request.target_id);

            // Single batch query instead of N+1
            const requests = await AccountModel.find({
                _id: { $in: targetIds },
            }).select('-password');

            return res.status(200).json({ success: true, body: requests });
        } catch (e) {
            logger.error('An error occurred while fetching requests: ', e);
            return res.status(500).json({
                success: false,
                message: 'An error occurred while fetching requests.',
            });
        }
    }

    // GET chat history
    async getChatHistory(req: Request, res: Response): Promise<Response | void> {
        const { id: targetId } = req.params;
        if (!targetId) return res.status(400).json({ success: false, message: 'No target provided.' });

        const userId = req.user?.userId;

        try {
            const [myProfile, targetProfile] = await Promise.all([
                AccountModel.findById(userId),
                AccountModel.findById(targetId).select('-password'),
            ]);

            if (!myProfile || !targetProfile) return res.status(404).json({ success: false, message: 'User not found.' });

            // Fix critical leak: strictly scope chat history to conversations between these two specific users only
            const chatHistory = await ChatModel.find({
                $or: [
                    { sender_id: myProfile._id, target_id: targetProfile._id },
                    { sender_id: targetProfile._id, target_id: myProfile._id },
                ],
            }).sort({ timestamp: 1 });

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

    // POST update profile
    async updateProfile(req: Request, res: Response): Promise<Response | void> {
        const { changes, data } = req.body;
        if (!changes || !Array.isArray(changes) || !data) return res.status(400).json({ success: false, message: 'Invalid request body.' });

        const user = await AccountModel.findById(req.user?.userId);

        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        try {
            for (const change of changes) {
                const err = await this.handleProfileChange(change, user, data);
                if (err) {
                    return res.status(400).json({ success: false, message: err });
                }
            }

            const updatedUser = await AccountModel.findById(user._id).select('-password');

            return res.status(200).json({ success: true, user: updatedUser });
        } catch (e) {
            logger.error('Error updating profile: ', e);
            return res.status(500).json({
                success: false,
                message: 'An error occurred while updating profile.',
            });
        }
    }

    // POST handle friend request actions
    async handleRequests(req: Request, res: Response): Promise<Response | void> {
        const { type, userId: reqId } = req.body;
        const userId = req.user?.userId;

        if (!type || !reqId || !userId || typeof type !== 'string' || typeof reqId !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Invalid type or userId provided.',
            });
        }

        try {
            if (type === 'remove-friend') {
                await this.removeFriend(userId, reqId);

                return res.status(200).json({
                    success: true,
                    message: 'Friend has been removed.',
                });
            }

            if (type.includes('request')) {
                await this.handleFriendRequest(type, userId, reqId);

                return res.status(200).json({ success: true });
            }

            return res.status(400).json({
                success: false,
                message: 'Unknown request type.',
            });
        } catch (e) {
            logger.error('An error occurred while handling friend request: ', e);
            return res.status(500).json({
                success: false,
                message: 'An error occurred while handling the friend request.',
            });
        }
    }

    // POST update settings
    async updateSettings(req: Request, res: Response): Promise<Response | void> {
        const { type, data } = req.body;
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'User ID is missing.' });
        }

        if (typeof type !== 'string') {
            return res.status(400).json({ success: false, message: 'Invalid type.' });
        }

        const updateActions: Record<string, () => Promise<void>> = {
            static_status: async () => {
                if (data === 'online' || data === 'offline') {
                    await AccountModel.updateOne(
                        { _id: userId },
                        {
                            $set: {
                                online: data === 'online',
                                lastOnline: data === 'offline' ? new Date() : null,
                            },
                        }
                    );
                }
            },
            highlight_friends: async () => {
                if (typeof data === 'boolean') {
                    await UserSettingsModel.updateOne({ target: userId }, { $set: { highlight_friends: data } });
                }
            },
            highlight_color: async () => {
                if (/^#[0-9A-F]{6}[0-9a-f]{0,2}$/i.test(data)) {
                    await UserSettingsModel.updateOne({ target: userId }, { $set: { highlight_color: data } });
                }
            },
            visible: async () => {
                if (typeof data === 'boolean') {
                    await AccountModel.updateOne({ _id: userId }, { $set: { visible: data } });
                }
            },
        };

        try {
            if (updateActions[type]) {
                await updateActions[type]();
                return res.status(200).json({ success: true });
            }
            return res.status(400).json({
                success: false,
                message: 'Invalid request type provided.',
            });
        } catch (e) {
            logger.error('Error updating settings: ', e);
            return res.status(500).json({
                success: false,
                message: 'An error occurred while updating settings.',
            });
        }
    }

    private async handleProfileChange(change: string, user: any, data: any): Promise<string | void> {
        if (change === 'username') return this.updateUsername(user, data.username);
        if (change === 'bio') return this.updateBio(user, data.bio);
    }

    private async updateUsername(user: any, username: string): Promise<string | void> {
        if (!username || typeof username !== 'string') return 'Invalid username.';
        const sanitizedUsername = noXSS(username.trim());

        const validUsername = validateUsername(sanitizedUsername);
        if (typeof validUsername === 'string') return validUsername;

        const existingUser = await AccountModel.findOne({ username: sanitizedUsername });
        if (existingUser && existingUser._id.toString() !== user._id.toString()) {
            return 'Username is already taken.';
        }

        await AccountModel.updateOne({ _id: user._id }, { $set: { username: sanitizedUsername } });
    }

    private async updateBio(user: any, bio: string): Promise<string | void> {
        if (typeof bio !== 'string') return 'Invalid bio.';
        const sanitizedBio = noXSS(bio.trim());
        if (user.role === 'Member' && /https?:\/\/|www\.|\.com|\.gg/i.test(sanitizedBio)) return 'Bio cannot contain external links.';
        if (sanitizedBio.length > 250) return 'Bio is too long (maximum 250 characters).';

        await AccountModel.updateOne({ _id: user._id }, { $set: { bio: sanitizedBio } });
    }

    private async removeFriend(userId: string, reqId: string) {
        await FriendModel.deleteMany({
            $or: [
                { user_id: userId, friend_id: reqId },
                { user_id: reqId, friend_id: userId },
            ],
        });
    }

    private async handleFriendRequest(type: string, userId: string, reqId: string) {
        if (type === 'accept-request') {
            await Promise.all([
                FriendModel.updateOne(
                    { user_id: userId, friend_id: reqId },
                    { $setOnInsert: { user_id: userId, friend_id: reqId, timestamp: new Date() } },
                    { upsert: true }
                ),
                FriendModel.updateOne(
                    { user_id: reqId, friend_id: userId },
                    { $setOnInsert: { user_id: reqId, friend_id: userId, timestamp: new Date() } },
                    { upsert: true }
                ),
            ]);
        }
        await RequestModel.deleteOne({ target_id: reqId, req_id: userId });
    }
}

export default new ProfileController();
