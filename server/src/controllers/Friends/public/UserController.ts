import { Request, Response } from 'express';
import AccountModel from '../../../models/AccountModel';
import logger from '../../../utils/logger';
import UserSettingsModel from '../../../models/UserSettingsModel';
import RequestModel from '../../../models/RequestModel';
import FriendModel from '../../../models/FriendModel';

class PublicUserController {
    // POST
    async getAllUsers(req: Request, res: Response): Promise<Response | void> {
        const { amount, offset } = req.body;

        if (!amount || amount < 1 || amount > 100) {
            return res.status(401).json({
                success: false,
                message: 'No amount provided or not a valid amount.',
            });
        }

        try {
            // gets all users by role priority, specific amount and given offset
            const users = await AccountModel.aggregate([
                { $match: { visible: true } },
                {
                    $addFields: {
                        rolePriority: {
                            $switch: {
                                branches: [
                                    {
                                        case: { $eq: ['$role', 'Owner'] },
                                        then: 1,
                                    },
                                    {
                                        case: { $eq: ['$role', 'Moderator'] },
                                        then: 2,
                                    },
                                    {
                                        case: { $eq: ['$role', 'Vip'] },
                                        then: 3,
                                    },
                                    {
                                        case: { $eq: ['$role', 'Member'] },
                                        then: 4,
                                    },
                                ],
                                default: 5,
                            },
                        },
                    },
                },
                { $sort: { rolePriority: 1, username: 1 } },
                { $skip: offset || 0 },
                { $limit: amount },
                {
                    $project: {
                        _id: 1,
                        username: 1,
                        role: 1,
                        imageURL: 1,
                        bio: 1,
                        badges: 1,
                        online: 1,
                    },
                },
            ]);

            res.json({
                success: true,
                users,
            });
        } catch (e) {
            logger.error('Error fetching users: ', e);
            return res.status(400).json({
                success: false,
                message: 'An error occurred while fetching users.',
            });
        }
    }

    // GET
    async profile(req: Request, res: Response): Promise<Response | void> {
        const { userId } = req.params;

        if (!userId || userId === 'undefined') {
            return res.status(400).json({
                success: false,
                message: 'User ID is required.',
            });
        }

        try {
            const reqUser = await AccountModel.findOne({ _id: userId });

            if (!reqUser) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found.',
                });
            }

            return res.status(200).json({
                success: true,
                user: reqUser,
            });
        } catch (e) {
            logger.error('Error fetching profile: ', e);
            return res.status(400).json({
                success: false,
                message: 'An error occurred while fetching the profile.',
            });
        }
    }

    // POST
    async friendRequest(req: Request, res: Response): Promise<Response | void> {
        const { req_id } = req.body;
        const userId = req.user?.userId;

        if (!req_id) {
            return res.status(400).json({
                success: false,
                message: 'User ID for request is required.',
            });
        }

        if (userId === req_id) {
            return res.status(400).json({
                success: false,
                message: 'You cannot send a friend request to yourself.',
            });
        }

        try {
            // check if the targeted user exists
            const userExists = await AccountModel.find({ _id: req_id });
            if (!userExists) {
                return res.status(400).json({
                    success: false,
                    message: 'User does not exist.',
                });
            }

            // check if targeted user accepts friend requests
            const targetUserSettings = await UserSettingsModel.findOne({
                target: req_id,
            });
            if (
                !targetUserSettings ||
                targetUserSettings.accept_requests == false
            ) {
                return res.status(400).json({
                    success: false,
                    message: "User doesn't accept friend requests.",
                });
            }

            // check if user has already sent a request to the target
            const existingRequest = await RequestModel.findOne({
                req_id,
                target_id: userId,
            });

            if (existingRequest) {
                return res.status(400).json({
                    success: false,
                    message: 'This request has already been opened.',
                });
            }

            // check if user and target are already friends
            const isFriend = await FriendModel.exists({
                user_id: userId,
                friend_id: req_id,
            });
            if (isFriend) {
                return res.json({
                    success: false,
                    message: 'You are already friends!',
                });
            }

            // open the request
            await RequestModel.create({ req_id, target_id: userId });

            res.json({
                success: true,
                message: 'Friend request sent!',
            });
        } catch (e) {
            logger.error('Error sending friend request: ', e);
            return res.status(400).json({
                success: false,
                message: 'An error occurred while sending friend request.',
            });
        }
    }

    // GET
    async searchUser(req: Request, res: Response): Promise<Response | void> {
        const query = req.query.q;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'No search query provided or invalid type.',
            });
        } else if (query.length > 40) {
            return res.status(400).json({
                success: false,
                message: 'Search query too long.',
            });
        }

        const regex = new RegExp(`^${query}`, 'i');

        try {
            const users = await AccountModel.find({ username: regex })
                .select('id username role imageURL bio badges online')
                .sort({ role: 1, username: 1 });

            if (!users.length) {
                return res.status(404).json({
                    success: false,
                    message: 'No user found with the given username or id.',
                });
            }

            res.json({
                success: true,
                users,
            });
        } catch (e) {
            logger.error('Error searching user: ', e);
            return res.status(400).json({
                success: false,
                message: 'An error occurred while searching user.',
            });
        }
    }
}

export default new PublicUserController();
