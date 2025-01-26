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

    // POST
    async updateProfile(req: Request, res: Response) {
        const { changes, data } = req.body;

        try {
            const user = await AccountModel.findOne({ _id: req.user?.userId });

            if (!user) {
                return res.status(200).json({
                    success: false,
                    message: 'User not found.',
                });
            }

            for (const change of changes) {
                switch (change) {
                    case 'username': {
                        const existingUser = await AccountModel.findOne({
                            username: data.username,
                        });

                        if (existingUser) {
                            return res.status(400).json({
                                success: false,
                                message: 'Username is already taken.',
                            });
                        }

                        const validUsername = validateUsername(data.username);
                        // type is string if the username is not a valid one
                        if (typeof validUsername === 'string') {
                            return res.status(200).json({
                                success: false,
                                message: validUsername,
                            });
                        }

                        const username = noXSS(data.username);

                        await AccountModel.updateOne(
                            {
                                _id: user._id,
                            },
                            {
                                $set: { username },
                            }
                        );

                        break;
                    }
                    case 'bio': {
                        const bio = noXSS(data.bio);
                        if (
                            user.role === 'Member' &&
                            (bio.includes('http') ||
                                bio.includes('.com') ||
                                bio.includes('.gg'))
                        ) {
                            return res.status(200).json({
                                success: false,
                                message: 'Bio contains a link.',
                            });
                        }

                        if (bio.length > 250) {
                            return res.status(200).json({
                                success: false,
                                message: 'Bio is too long.',
                            });
                        }

                        await AccountModel.updateOne(
                            { _id: user._id },
                            { $set: { bio } }
                        );

                        break;
                    }
                }

                const updatedUser = await AccountModel.findOne({
                    _id: user._id,
                }).select('-password');

                return res.status(200).json({
                    success: true,
                    user: updatedUser,
                });
            }
        } catch (e) {
            return res.status(200).json({
                success: false,
                message: 'An error occurred while updating profile.',
            });
        }
    }
}

export default new ProfileController();
