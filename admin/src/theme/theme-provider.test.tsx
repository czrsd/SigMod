import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ThemeProvider } from './theme-provider';
import { ThemeSwitcher } from './theme-switcher';

afterEach(cleanup);

describe('admin dark appearance', () => {
    it('applies dark document semantics despite a previously saved preference', () => {
        localStorage.setItem('sigmod-admin-theme', 'light');
        document.documentElement.classList.remove('dark');
        render(<ThemeProvider><span>Dashboard</span><ThemeSwitcher /></ThemeProvider>);
        expect(screen.getByText('Dashboard')).toBeVisible();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(document.documentElement.style.colorScheme).toBe('dark');
        expect(screen.queryByLabelText('Appearance')).not.toBeInTheDocument();
        localStorage.clear();
    });
});
