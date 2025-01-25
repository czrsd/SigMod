import { Request, Response } from 'express';
import AccountModel from '../../../models/AccountModel';
import logger from '../../../utils/logger';

class PublicUserController {
    async getAllUsers(req: Request, res: Response) {
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
            return res.status(500).json({
                success: false,
                message: 'An error occurred while fetching users.',
            });
        }
    }

    async profile(req: Request, res: Response) {
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
            return res.status(500).json({
                success: false,
                message: 'An error occurred while fetching the profile.',
            });
        }
    }
}

export default PublicUserController;
