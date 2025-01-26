import { RequestHandler, Router } from 'express';
import AccountController from '../controllers/Friends/AccountController';
import UserController from '../controllers/Friends/public/UserController';
import { requireUser } from '../middleware/requireUser';
import ProfileController from '../controllers/Friends/private/ProfileController';

const router = Router();

// for a better overview
const routes = {
    // account based
    register: '/register', // POST
    login: '/login', // POST
    auth: '/auth', // GET
    logout: '/logout', // GET
    // 'public' user request
    allUsers: '/users', // POST
    profile: '/profile', // GET
    request: '/request', // POST
    search: '/search', // GET
    // 'private' - me - profile requests
    edit: '/me/edit',
    friends: '/me/friends', // GET
    requests: '/me/requests', // GET
    handleRequests: '/me/handle', // POST
    chatHistory: '/me/chat', // GET
};

// AUTH ROUTES
router.post(routes.register, AccountController.register as RequestHandler);
router.post(routes.login, AccountController.login as RequestHandler);
router.get(
    routes.auth,
    requireUser as RequestHandler,
    AccountController.auth as RequestHandler
);
router.get(
    routes.logout,
    requireUser as RequestHandler,
    AccountController.logout as RequestHandler
);

// PUBLIC ROUTES
router.post(
    routes.allUsers,
    requireUser as RequestHandler,
    UserController.getAllUsers as RequestHandler
);
router.get(
    `${routes.profile}/:userId`,
    requireUser as RequestHandler,
    UserController.profile as RequestHandler
);
router.post(
    routes.request,
    requireUser as RequestHandler,
    UserController.friendRequest as RequestHandler
);
router.get(
    routes.search,
    requireUser as RequestHandler,
    UserController.searchUser as RequestHandler
);

// PRIVATE ROUTES
router.post(
    routes.edit,
    requireUser as RequestHandler,
    ProfileController.updateProfile as RequestHandler
);
router.get(
    routes.friends,
    requireUser as RequestHandler,
    ProfileController.getFriends as RequestHandler
);
router.get(
    routes.requests,
    requireUser as RequestHandler,
    ProfileController.getRequests as RequestHandler
);
router.post(
    routes.handleRequests,
    requireUser as RequestHandler,
    ProfileController.handleRequests as RequestHandler
);
router.get(
    `${routes.chatHistory}/:id`,
    requireUser as RequestHandler,
    ProfileController.getChatHistory as RequestHandler
);

export default router;
