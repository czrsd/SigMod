import axios from 'axios';
import logger from './logger';

let cachedTotal = 0;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

const getPlayers = async (): Promise<number> => {
    const now = Date.now();
    if (now < cacheExpiry) {
        return cachedTotal;
    }

    const urls = [
        'https://eu0.sigmally.com/server/serversstats',
        'https://ca0.sigmally.com/server/serversstats',
        'https://ca1.sigmally.com/server/serversstats',
    ];

    try {
        const results = await Promise.allSettled(urls.map((url) => axios.get(url, { timeout: 3500 })));

        let totalPlayers = 0;
        let successCount = 0;

        for (const res of results) {
            if (res.status === 'fulfilled' && res.value?.data?.body?.serverstats?.players_current) {
                totalPlayers += Number(res.value.data.body.serverstats.players_current) || 0;
                successCount++;
            }
        }

        if (successCount > 0) {
            cachedTotal = totalPlayers;
            cacheExpiry = now + CACHE_TTL_MS;
        }
    } catch (err) {
        logger.error('Error fetching total players:', err);
    }

    return cachedTotal;
};

export default getPlayers;
