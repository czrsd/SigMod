import SessionsModel from '../models/SessionModel';
import { ObjectId } from 'mongodb';

export async function getSession(sessionIdString: string) {
    try {
        const sessionId = new ObjectId(sessionIdString);
        const session: any = await SessionsModel.findOne({ sessionId });

        if (!session || !session.valid) {
            return null;
        }

        const { userId, valid, sessionId: id } = session;
        return { userId, valid, sessionId: id };
    } catch (error) {
        console.error('Error getting session:', error);
        return null;
    }
}

export async function invalidateSession(sessionId: string) {
    try {
        return await SessionsModel.findOneAndUpdate(
            { sessionId: new ObjectId(sessionId) },
            { valid: false },
            { new: true }
        );
    } catch (error) {
        console.error('Error invalidating session:', error);
        return null;
    }
}

export async function createSession(user_id: string) {
    try {
        const session = new SessionsModel({ userId: user_id, valid: true });
        await session.save();
        return session;
    } catch (error) {
        console.error('Error creating session:', error);
        return null;
    }
}
