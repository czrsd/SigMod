import { Request, Response } from 'express';
import AccountModel from '../../../models/AccountModel';
import ChatModel from '../../../models/ChatModel';
import logger from '../../../utils/logger';
import FriendModel from '../../../models/FriendModel';
import { wsHandler } from '../../../socket/setup';
import RequestModel from '../../../models/RequestModel';
import { noXSS } from '../../../utils/helpers';
import { validateUsername } from '../../../utils/validation';

class ProfileController {
    constructor() {
        this.getFriends = this.getFriends.bind(this);
        this.getRequests = this.getRequests.bind(this);
        this.getChatHistory = this.getChatHistory.bind(this);
        this.updateProfile = this.updateProfile.bind(this);
    }

    // GET
    async getFriends(req: Request, res: Response) {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is missing.',
            });
        }

        try {
            const friendDocs = await FriendModel.find({ user_id: userId });
            const friendIds = friendDocs.map((doc) => doc.friend_id.toString());

            const friends = await this.fetchProfiles(friendIds);
            const onlineFriends = wsHandler
                .onlineFriends(friendIds)
                .filter((friend) => friend.modUser?._id);

            this.mergeOnlineStatus(friends, onlineFriends);

            return res.json({ success: true, friends });
        } catch (e) {
            logger.error('An error occurred while fetching friends: ', e);
            return res.status(500).json({
                success: false,
                message: 'An error occurred while fetching friends.',
            });
        }
    }

    // GET
    async getRequests(req: Request, res: Response) {
        const userId = req.user?.userId;

        if (!userId) {
            return res
                .status(400)
                .json({ success: false, message: 'User ID is missing.' });
        }

        try {
            const requestIds = await RequestModel.find({ req_id: userId });

            const requests = await Promise.all(
                requestIds.map(async (request) => {
                    const profile = await AccountModel.findOne({
                        _id: request.target_id,
                    }).select('-password');
                    return profile ?? null;
                })
            );

            return res
                .status(200)
                .json({ success: true, body: requests.filter(Boolean) });
        } catch (e) {
            logger.error('An error occurred while fetching requests: ', e);
            return res.status(500).json({
                success: false,
                message: 'An error occurred while fetching requests.',
            });
        }
    }

    // GET
    async getChatHistory(req: Request, res: Response) {
        const { id: targetId } = req.params;

        if (!targetId) {
            return res.status(400).json({
                success: false,
                message: 'No target provided.',
            });
        }

        const userId = req.user?.userId;

        try {
            const [myProfile, targetProfile] = await Promise.all([
                AccountModel.findOne({ _id: userId }),
                AccountModel.findOne({ _id: targetId }).select('-password'),
            ]);

            if (!targetProfile || !myProfile) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found.',
                });
            }

            const chatHistory = await ChatModel.find({
                sender_id: { $in: [myProfile._id, targetProfile._id] },
            });

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

    // POST
    async updateProfile(req: Request, res: Response) {
        const { changes, data } = req.body;

        if (!changes || !data) {
            return res
                .status(400)
                .json({ success: false, message: 'Invalid request body.' });
        }

        const user = await AccountModel.findOne({ _id: req.user?.userId });

        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: 'User not found.' });
        }

        try {
            const updateTasks = changes.map((change: string) =>
                this.handleProfileChange(change, user, data, res)
            );
            await Promise.all(updateTasks);

            const updatedUser = await AccountModel.findOne({
                _id: user._id,
            }).select('-password');
            return res.status(200).json({ success: true, user: updatedUser });
        } catch (e) {
            logger.error('Error updating profile: ', e);
            return res.status(500).json({
                success: false,
                message: 'An error occurred while updating profile.',
            });
        }
    }

    // helper methods
    private async fetchProfiles(friendIds: string[]) {
        return Promise.all(
            friendIds.map(async (friendId) => {
                const profile = await AccountModel.findOne({ _id: friendId });
                if (!profile) throw new Error('User not found.');
                return profile;
            })
        );
    }

    private mergeOnlineStatus(friends: any[], onlineFriends: any[]) {
        for (const onlineFriend of onlineFriends) {
            const friendIndex = friends.findIndex(
                (friend) => friend._id.toString() === onlineFriend.modUser!._id
            );
            if (friendIndex === -1) continue;

            const { password, ...modifiedFriend } = {
                ...friends[friendIndex].toObject(),
                server: onlineFriend.server,
                tag: onlineFriend.tag,
                nick: onlineFriend.nick,
            };

            friends[friendIndex] = modifiedFriend as any;
        }
    }

    private async handleProfileChange(
        change: string,
        user: any,
        data: any,
        res: Response
    ) {
        switch (change) {
            case 'username':
                return this.updateUsername(user, data.username, res);
            case 'bio':
                return this.updateBio(user, data.bio, res);
            default:
                return Promise.resolve();
        }
    }

    private async updateUsername(user: any, username: string, res: Response) {
        const existingUser = await AccountModel.findOne({ username });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Username is already taken.',
            });
        }

        const validUsername = validateUsername(username);
        if (typeof validUsername === 'string') {
            return res
                .status(400)
                .json({ success: false, message: validUsername });
        }

        const sanitizedUsername = noXSS(username);
        await AccountModel.updateOne(
            { _id: user._id },
            { $set: { username: sanitizedUsername } }
        );
    }

    private async updateBio(user: any, bio: string, res: Response) {
        const sanitizedBio = noXSS(bio);

        if (user.role === 'Member' && /http|\.com|\.gg/.test(sanitizedBio)) {
            return res
                .status(400)
                .json({ success: false, message: 'Bio contains a link.' });
        }

        if (sanitizedBio.length > 250) {
            return res
                .status(400)
                .json({ success: false, message: 'Bio is too long.' });
        }

        await AccountModel.updateOne(
            { _id: user._id },
            { $set: { bio: sanitizedBio } }
        );
    }
}

export default new ProfileController();
