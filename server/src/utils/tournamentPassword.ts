import axios from 'axios';
import { readFile } from './helpers';

const getTournamentPassword = async () => {
    const key = readFile(process.env.TOURNAMENT_KEY_PATH || '');
    const url =
        process.env.NODE_ENV === 'development'
            ? `http://localhost:3003/data/${key}`
            : `https://tournament.czrsd.com/data/${key}`;

    const res = await axios.get(url);

    return res.data.password;
};

export default getTournamentPassword;
