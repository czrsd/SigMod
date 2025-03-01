import axios from 'axios';

const getPlayers = async () => {
    let totalPlayers = 0;
    const urls = [
        'https://eu0.sigmally.com/server/serversstats',
        'https://ca0.sigmally.com/server/serversstats',
        'https://ca1.sigmally.com/server/serversstats',
    ];

    for (const url of urls) {
        try {
            const response = await axios.get(url);
            const playersCurrent =
                response.data.body.serverstats.players_current;
            totalPlayers += playersCurrent;
        } catch (error) {
            console.error(`Failed to fetch data from ${url}:`, error);
        }
    }

    return totalPlayers;
};

export default getPlayers;
