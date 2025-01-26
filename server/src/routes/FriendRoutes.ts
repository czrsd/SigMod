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
    chatHistory: '/me/chat', // GET
};

/*************************************/
/*************AUTH ROUTES*************/
/*************************************/

router.post(
    routes.register,
    AccountController.register as unknown as RequestHandler
);

router.post(routes.login, AccountController.login as unknown as RequestHandler);

router.get(
    routes.auth,
    requireUser as unknown as RequestHandler,
    AccountController.auth as unknown as RequestHandler
);

router.get(
    routes.logout,
    requireUser as unknown as RequestHandler,
    AccountController.logout as unknown as RequestHandler
);

/*************************************/
/************PUBLIC ROUTES************/
/*************************************/

router.post(
    routes.allUsers,
    requireUser as unknown as RequestHandler,
    UserController.getAllUsers as unknown as RequestHandler
);

router.get(
    `${routes.profile}/:userId`,
    requireUser as unknown as RequestHandler,
    UserController.profile as unknown as RequestHandler
);
router.post(
    routes.request,
    requireUser as unknown as RequestHandler,
    UserController.friendRequest as unknown as RequestHandler
);
router.get(
    routes.search,
    requireUser as unknown as RequestHandler,
    UserController.searchUser as unknown as RequestHandler
);

/*************************************/
/***********PRIVATE ROUTES************/
/*************************************/

router.post(
    routes.edit,
    requireUser as unknown as RequestHandler,
    ProfileController.updateProfile as unknown as RequestHandler
);

router.get(
    routes.friends,
    requireUser as unknown as RequestHandler,
    ProfileController.getFriends as unknown as RequestHandler
);

router.get(
    routes.requests,
    requireUser as unknown as RequestHandler,
    ProfileController.getRequests as unknown as RequestHandler
);

router.get(
    `${routes.chatHistory}/:id`,
    requireUser as unknown as RequestHandler,
    ProfileController.getChatHistory as unknown as RequestHandler
);

export default router;
