import AccountModel from '../models/AccountModel';

const cleanup = async (): Promise<void> => {
    await AccountModel.updateMany(
        { online: true },
        { online: false, lastOnline: new Date() }
    );

    console.log('Cleanup performed successfully.');
};

const setupExitHandlers = () => {
    process.on('exit', async (code) => {
        console.log(`Process is exiting with code: ${code}`);
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
