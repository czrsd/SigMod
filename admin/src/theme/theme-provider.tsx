import { createContext, useContext, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const ThemeContext = createContext<{
    theme: ThemePreference;
    setTheme: (theme: ThemePreference) => void;
} | null>(null);

function applyDarkTheme() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.add('dark');
    root.dataset.theme = 'dark';
    root.style.colorScheme = 'dark';
}

applyDarkTheme();

export function ThemeProvider({ children }: { children: ReactNode }) {
    applyDarkTheme();

    return (
        <ThemeContext.Provider value={{ theme: 'dark', setTheme: applyDarkTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const value = useContext(ThemeContext);
    if (!value) throw new Error('useTheme must be used within ThemeProvider');
    return value;
}
