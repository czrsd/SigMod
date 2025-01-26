import AccountModel from '../models/AccountModel';
import logger from './logger';

const cleanup = async (): Promise<void> => {
    await AccountModel.updateMany(
        { online: true },
        { online: false, lastOnline: new Date() }
    );

    logger.info('Cleanup performed successfully.');
};

const setupExitHandlers = () => {
    process.on('exit', async (code) => {
        logger.info(`Process is exiting with code: ${code}`);
        await cleanup();
    });

    // ctrl+c or kill commands
    process.on('SIGINT', async () => {
        await cleanup();
        process.exit();
    });

    // termination signals
    process.on('SIGTERM', async () => {
        await cleanup();
        process.exit();
    });
};

export default setupExitHandlers;
