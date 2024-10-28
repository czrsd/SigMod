// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            'no-console': 'warn',
            quotes: [
                'error',
                'single',
                { avoidEscape: true, allowTemplateLiterals: true },
            ],
            semi: ['error', 'always'],
            indent: ['error', 4],
            'max-len': ['warn', { code: 120 }],
        },
    }
);
