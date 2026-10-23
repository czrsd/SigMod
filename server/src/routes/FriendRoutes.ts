import { RequestHandler, Router } from 'express';
import AccountController from '../controllers/Friends/AccountController';
import UserController from '../controllers/Friends/public/UserController';
import { requireUser } from '../middleware/requireUser';
import ProfileController from '../controllers/Friends/private/ProfileController';
import ProfileImageController from '../controllers/Friends/private/ProfileImageController';

const router = Router();
router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});

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
import { asyncRoute } from '../admin/common';

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: { success: false, message: 'Too many authentication attempts, please try again later.' },
});

router.post(routes.register, authLimiter, asyncRoute(AccountController.register));
router.post(routes.login, authLimiter, AccountController.login as RequestHandler);
router.get(routes.auth, requireUser as RequestHandler, asyncRoute(AccountController.auth));
router.post(
    routes.logout,
    (req, res, next) => {
        const origins = [
            'https://mod.czrsd.com',
            'https://sigmally.com',
            'https://beta.sigmally.com',
            'https://one.sigmally.com',
            'http://localhost:5173',
            'http://localhost:3001',
        ];
        if (!req.get('authorization')?.startsWith('Bearer ') && !origins.includes(req.get('origin') || '')) {
            res.status(403).json({ success: false, message: 'Invalid logout origin.' });
            return;
        }
        next();
    },
    requireUser as RequestHandler,
    asyncRoute(AccountController.logout)
);

router.post(routes.allUsers, requireUser as RequestHandler, asyncRoute(UserController.getAllUsers));
router.get(`${routes.profile}/:userId`, requireUser as RequestHandler, asyncRoute(UserController.profile));
router.post(routes.request, requireUser as RequestHandler, asyncRoute(UserController.friendRequest));
router.get(routes.search, requireUser as RequestHandler, asyncRoute(UserController.searchUser));

router.post(routes.edit, requireUser as RequestHandler, asyncRoute(ProfileController.updateProfile));
router.post(routes.updateSettings, requireUser as RequestHandler, asyncRoute(ProfileController.updateSettings));
router.get(routes.friends, requireUser as RequestHandler, asyncRoute(ProfileController.getFriends));
router.get(routes.requests, requireUser as RequestHandler, asyncRoute(ProfileController.getRequests));
router.post(routes.handleRequests, requireUser as RequestHandler, asyncRoute(ProfileController.handleRequests));
router.get(`${routes.chatHistory}/:id`, requireUser as RequestHandler, asyncRoute(ProfileController.getChatHistory));
router.post(
    routes.uploadImage,
    requireUser as RequestHandler,
    ProfileImageController.upload.single('image') as RequestHandler,
    asyncRoute(ProfileImageController.uploadImage)
);
router.delete(routes.removeImage, requireUser as RequestHandler, asyncRoute(ProfileImageController.removeProfileImage));

export default router;
