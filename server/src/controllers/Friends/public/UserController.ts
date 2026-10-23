import { Request, Response } from 'express';
import AccountModel from '../../../models/AccountModel';
import logger from '../../../utils/logger';
import { sendFriendRequest } from '../../../services/friendships';
import { HttpError } from '../../../admin/common';

class PublicUserController {
    async getAllUsers(req: Request, res: Response): Promise<Response | void> {
        let { amount, offset } = req.body;

        if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100) {
            return res.status(401).json({
                success: false,
                message: 'No amount provided or not a valid amount.',
            });
        }

        offset = Number.isSafeInteger(offset) && offset >= 0 && offset <= 100000 ? Math.floor(offset) : 0;

        try {
            const users = await AccountModel.aggregate([
                { $match: { visible: true, merged_into: { $exists: false } } },
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

    async profile(req: Request, res: Response): Promise<Response | void> {
        const { userId } = req.params;

        if (!userId || userId === 'undefined') {
            return res.status(400).json({
                success: false,
                message: 'User ID is required.',
            });
        }

        try {
            const reqUser = await AccountModel.findOne({
                _id: userId,
                merged_into: { $exists: false },
                $or: [{ visible: { $ne: false } }, { _id: req.user?.userId }],
            }).select('_id username imageURL role bio badges online lastOnline visible create_time');

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

    async friendRequest(req: Request, res: Response): Promise<Response | void> {
        const target = req.body?.req_id;
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized.' });
        if (typeof target !== 'string') return res.status(400).json({ success: false, message: 'Invalid friend target.' });
        try {
            await sendFriendRequest(userId, target);
            return res.json({ success: true, message: 'Friend request sent!' });
        } catch (error) {
            return res
                .status(error instanceof HttpError ? error.status : 503)
                .json({ success: false, message: error instanceof HttpError ? error.message : 'Unable to send friend request.' });
        }
    }

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

        const escapedQuery = query.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const regex = new RegExp(`^${escapedQuery}`, 'i');

        try {
            const users = await AccountModel.find({ username: regex, visible: true, merged_into: { $exists: false } })
                .select('id username role imageURL bio badges online')
                .sort({ role: 1, username: 1 })
                .limit(50);

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
