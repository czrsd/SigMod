import rules from '../../config/chatFilterDefaults.json';
import type { ChatFilterContent } from './validation';

export function defaultChatFilter(): ChatFilterContent {
    return {
        id: 'chatFilter',
        revision: 0,
        enabled: true,
        names: [...rules.names],
        messages: [...rules.messages],
    };
}
