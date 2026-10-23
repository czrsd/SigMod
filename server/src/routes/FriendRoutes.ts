import { RequestHandler, Router } from 'express';
import AccountController from '../controllers/Friends/AccountController';
import UserController from '../controllers/Friends/public/UserController';
import { requireUser } from '../middleware/requireUser';
import ProfileController from '../controllers/Friends/private/ProfileController';
import ProfileImageController from '../controllers/Friends/private/ProfileImageController';

const router = Router();

const routes = {
    register: '/register',
    login: '/login',
    auth: '/auth',
    logout: '/logout',
    allUsers: '/users',
    profile: '/profile',
    request: '/request',
    search: '/search',
    edit: '/me/edit',
    updateSettings: '/me/update-settings',
    friends: '/me/friends',
    requests: '/me/requests',
    handleRequests: '/me/handle',
    chatHistory: '/me/chat',
    uploadImage: '/me/upload',
    removeImage: '/me/remove',
};

import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: { success: false, message: 'Too many authentication attempts, please try again later.' },
});

router.post(routes.register, authLimiter, AccountController.register as RequestHandler);
router.post(routes.login, authLimiter, AccountController.login as RequestHandler);
router.get(routes.auth, requireUser as RequestHandler, AccountController.auth as RequestHandler);
router.get(routes.logout, requireUser as RequestHandler, AccountController.logout as RequestHandler);

router.post(routes.allUsers, requireUser as RequestHandler, UserController.getAllUsers as RequestHandler);
router.get(`${routes.profile}/:userId`, requireUser as RequestHandler, UserController.profile as RequestHandler);
router.post(routes.request, requireUser as RequestHandler, UserController.friendRequest as RequestHandler);
router.get(routes.search, requireUser as RequestHandler, UserController.searchUser as RequestHandler);

router.post(routes.edit, requireUser as RequestHandler, ProfileController.updateProfile as RequestHandler);
router.post(routes.updateSettings, requireUser as RequestHandler, ProfileController.updateSettings as RequestHandler);
router.get(routes.friends, requireUser as RequestHandler, ProfileController.getFriends as RequestHandler);
router.get(routes.requests, requireUser as RequestHandler, ProfileController.getRequests as RequestHandler);
router.post(routes.handleRequests, requireUser as RequestHandler, ProfileController.handleRequests as RequestHandler);
router.get(`${routes.chatHistory}/:id`, requireUser as RequestHandler, ProfileController.getChatHistory as RequestHandler);
router.post(
    routes.uploadImage,
    requireUser as RequestHandler,
    ProfileImageController.upload.single('image') as RequestHandler,
    ProfileImageController.uploadImage as RequestHandler
);
router.get(routes.removeImage, requireUser as RequestHandler, ProfileImageController.removeProfileImage as RequestHandler);

export default router;
