import SessionsModel from '../models/SessionModel';
import { ObjectId } from 'mongodb';
import { ISession } from '../models/SessionModel';

export async function getSession(sessionId: string) {
    try {
        const session: ISession | null = await SessionsModel.findOne({
            _id: sessionId,
        });

        if (!session || !session.valid) {
            return null;
        }

        return session;
    } catch (error) {
        console.error('Error getting session:', error);
        return null;
    }
}

export async function invalidateSession(sessionId: string) {
    try {
        return (await SessionsModel.findOneAndUpdate(
            { sessionId: new ObjectId(sessionId) },
            { valid: false },
            { new: true }
        )) as ISession;
    } catch (error) {
        console.error('Error invalidating session:', error);
        return null;
    }
}

export async function createSession(user_id: string) {
    try {
        const session: ISession = new SessionsModel({
            userId: user_id,
            valid: true,
        });
        await session.save();
        return session;
    } catch (error) {
        console.error('Error creating session:', error);
        return null;
    }
}
