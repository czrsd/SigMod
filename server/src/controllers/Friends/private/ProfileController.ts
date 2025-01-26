import { Request, Response } from 'express';
import AccountModel from '../../../models/AccountModel';
import ChatModel from '../../../models/ChatModel';
import logger from '../../../utils/logger';
import FriendModel from '../../../models/FriendModel';
import { wsHandler } from '../../../socket/setup';
import RequestModel from '../../../models/RequestModel';

class ProfileController {
    // GET
    async getFriends(req: Request, res: Response) {
        const userId = req.user?.userId;

        try {
            const friendDocs = await FriendModel.find({ user_id: userId });
            const friendIds: string[] = friendDocs.map((doc) =>
                doc.friend_id.toString()
            );

            const friends = await Promise.all(
                friendIds.map(async (friendId) => {
                    const profile = await AccountModel.findOne({
                        _id: friendId,
                    });
                    if (!profile) {
                        throw new Error('User not found.');
                    }
                    return profile;
                })
            );

            const onlineFriends = wsHandler
                .onlineFriends(friendIds)
                .filter((friend) => friend.modUser?._id);

            for (const onlineFriend of onlineFriends) {
                const i = friends.findIndex(
                    (friend) =>
                        friend._id.toString() === onlineFriend.modUser!._id
                );

                if (i === -1) continue;

                const { password, ...modifiedFriend } = {
                    ...friends[i].toObject(),
                    server: onlineFriend.server,
                    tag: onlineFriend.tag,
                    nick: onlineFriend.nick,
                };

                friends[i] =
                    modifiedFriend as unknown as (typeof friends)[number];
            }

            return res.json({
                success: true,
                friends,
            });
        } catch (e) {
            logger.error('An error occurred while fetching friends: ', e);
            return res.status(400).json({
                success: false,
                message: 'An error occurred while fetching friends.',
            });
        }
    }

    // GET
    async getRequests(req: Request, res: Response) {
        const userId = req.user?.userId;

        try {
            const requestIds = await RequestModel.find({ req_id: userId });

            const requests = [];

            for (const request of requestIds) {
                const profile = await AccountModel.findOne({
                    _id: request.target_id,
                });
                delete profile?.password;

                if (!profile) continue;

                requests.push(profile);
            }

            return res.status(200).json({
                success: true,
                body: requests,
            });
        } catch (e) {
            logger.error('An error occurred while fetching requests: ', e);
            return res.status(400).json({
                success: false,
                message: 'Ann error occurred while fetching requests.',
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
            const myProfile = await AccountModel.findOne({ _id: userId });
            const targetProfile = await AccountModel.findOne(
                { _id: targetId },
                { $set: '-password' }
            );

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
            return res.status(400).json({
                success: false,
                message: 'An error occurred while fetching chat history.',
            });
        }
    }
}

export default new ProfileController();
