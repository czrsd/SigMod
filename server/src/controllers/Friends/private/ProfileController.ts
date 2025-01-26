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
        this.handleRequests = this.handleRequests.bind(this);
    }

    // GET Friends
    async getFriends(req: Request, res: Response): Promise<Response | void> {
        const userId = req.user?.userId;
        if (!userId)
            return res
                .status(200)
                .json({ success: false, message: 'User ID is missing.' });

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
            return res.status(200).json({
                success: false,
                message: 'An error occurred while fetching friends.',
            });
        }
    }

    // GET Requests
    async getRequests(req: Request, res: Response): Promise<Response | void> {
        const userId = req.user?.userId;
        if (!userId)
            return res
                .status(200)
                .json({ success: false, message: 'User ID is missing.' });

        try {
            const requestIds = await RequestModel.find({ req_id: userId });

            const requests = await Promise.all(
                requestIds.map((request) =>
                    this.fetchProfile(request.target_id.toString())
                )
            );

            return res
                .status(200)
                .json({ success: true, body: requests.filter(Boolean) });
        } catch (e) {
            logger.error('An error occurred while fetching requests: ', e);
            return res.status(200).json({
                success: false,
                message: 'An error occurred while fetching requests.',
            });
        }
    }

    // GET chat history
    async getChatHistory(
        req: Request,
        res: Response
    ): Promise<Response | void> {
        const { id: targetId } = req.params;
        if (!targetId)
            return res
                .status(200)
                .json({ success: false, message: 'No target provided.' });

        const userId = req.user?.userId;

        try {
            const [myProfile, targetProfile] = await Promise.all([
                AccountModel.findById(userId),
                AccountModel.findById(targetId).select('-password'),
            ]);

            if (!myProfile || !targetProfile)
                return res
                    .status(200)
                    .json({ success: false, message: 'User not found.' });

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
            return res.status(200).json({
                success: false,
                message: 'An error occurred while fetching chat history.',
            });
        }
    }

    // POST update profile
    async updateProfile(req: Request, res: Response): Promise<Response | void> {
        const { changes, data } = req.body;
        if (!changes || !data)
            return res
                .status(200)
                .json({ success: false, message: 'Invalid request body.' });

        const user = await AccountModel.findById(req.user?.userId);

        if (!user)
            return res
                .status(200)
                .json({ success: false, message: 'User not found.' });

        try {
            const updateTasks = changes.map((change: string) =>
                this.handleProfileChange(change, user, data, res)
            );

            await Promise.all(updateTasks);

            const updatedUser = await AccountModel.findById(user._id).select(
                '-password'
            );

            return res.status(200).json({ success: true, user: updatedUser });
        } catch (e) {
            logger.error('Error updating profile: ', e);
            return res.status(200).json({
                success: false,
                message: 'An error occurred while updating profile.',
            });
        }
    }

    // POST handle friend request actions
    async handleRequests(
        req: Request,
        res: Response
    ): Promise<Response | void> {
        const { type, userId: reqId } = req.body;
        const userId = req.user?.userId;

        if (!type || !reqId || !userId)
            return res.status(200).json({
                success: false,
                message: 'No type or userId provided.',
            });

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
        } catch (e) {
            logger.error(
                'An error occurred while handling friend request: ',
                e
            );
            return res.status(200).json({
                success: false,
                message: 'An error occurred while handling the friend request.',
            });
        }
    }

    // helper methods
    private async fetchProfiles(friendIds: string[]) {
        return Promise.all(
            friendIds.map((friendId) => this.fetchProfile(friendId))
        );
    }

    private async fetchProfile(friendId: string) {
        return AccountModel.findById(friendId);
    }

    private mergeOnlineStatus(friends: any[], onlineFriends: any[]) {
        onlineFriends.forEach((onlineFriend) => {
            const friendIndex = friends.findIndex(
                (friend) => friend._id.toString() === onlineFriend.modUser!._id
            );
            if (friendIndex !== -1) {
                const { password, ...modifiedFriend } = {
                    ...friends[friendIndex].toObject(),
                    ...onlineFriend,
                };
                friends[friendIndex] = modifiedFriend;
            }
        });
    }

    private async handleProfileChange(
        change: string,
        user: any,
        data: any,
        res: Response
    ) {
        if (change === 'username')
            return this.updateUsername(user, data.username, res);
        if (change === 'bio') return this.updateBio(user, data.bio, res);
    }

    private async updateUsername(user: any, username: string, res: Response) {
        const existingUser = await AccountModel.findOne({ username });
        if (existingUser)
            return res.status(200).json({
                success: false,
                message: 'Username is already taken.',
            });

        const validUsername = validateUsername(username);
        if (typeof validUsername === 'string')
            return res
                .status(200)
                .json({ success: false, message: validUsername });

        const sanitizedUsername = noXSS(username);
        await AccountModel.updateOne(
            { _id: user._id },
            { $set: { username: sanitizedUsername } }
        );
    }

    private async updateBio(user: any, bio: string, res: Response) {
        const sanitizedBio = noXSS(bio);
        if (user.role === 'Member' && /http|\.com|\.gg/.test(sanitizedBio))
            return res
                .status(200)
                .json({ success: false, message: 'Bio contains a link.' });
        if (sanitizedBio.length > 250)
            return res
                .status(200)
                .json({ success: false, message: 'Bio is too long.' });

        await AccountModel.updateOne(
            { _id: user._id },
            { $set: { bio: sanitizedBio } }
        );
    }

    private async removeFriend(userId: string, reqId: string) {
        await FriendModel.deleteOne({ user_id: userId, friend_id: reqId });
        await FriendModel.deleteOne({ user_id: reqId, friend_id: userId });
    }

    private async handleFriendRequest(
        type: string,
        userId: string,
        reqId: string
    ) {
        if (type === 'accept-request') {
            const friendship1 = new FriendModel({
                user_id: userId,
                friend_id: reqId,
            });
            const friendship2 = new FriendModel({
                user_id: reqId,
                friend_id: userId,
            });
            await friendship1.save();
            await friendship2.save();
        }
        await RequestModel.deleteOne({ target_id: reqId, req_id: userId });
    }
}

export default new ProfileController();
