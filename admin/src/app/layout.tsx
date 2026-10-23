import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
    Activity,
    Users,
    UserRound,
    SlidersHorizontal,
    Newspaper,
    Bell,
    ListFilter,
    Languages,
    Megaphone,
    Menu,
    LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useSession } from '@/auth/session';
import { ThemeSwitcher } from '@/theme/theme-switcher';
const links = [
    ['/', 'Server stats', Activity],
    ['/active-users', 'Active Users', Users],
    ['/sigmally-users', 'Sigmally users', Users],
    ['/sigmod-users', 'SigMod users', UserRound],
    ['/settings-usage', 'Settings usage', SlidersHorizontal],
    ['/parties', 'Parties', Users],
    ['/announcements', 'Announcements', Newspaper],
    ['/alerts', 'Alerts', Bell],
    ['/chat-filter', 'Chat filter', ListFilter],
    ['/translations', 'Translations', Languages],
    ['/promotions', 'Promotions', Megaphone],
] as const;
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
    const { identity, logout } = useSession();
    return (
        <>
            <a href="#main-content" className="skip-link">
                Skip to content
            </a>
            <div className="sidebar-brand">
                <img className="brand-mark" src="https://czrsd.com/static/sigmod/sigmodz.png" alt="" />
                <div>
                    <strong>SigMod</strong>
                    <span>Administration</span>
                </div>
            </div>
            <nav aria-label="Administration">
                {links.map(([path, label, Icon], index) => (
                    <NavLink
                        key={path}
                        to={path}
                        end={path === '/'}
                        onClick={onNavigate}
                        className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''} ${index === 6 ? 'nav-group-start' : ''}`}
                    >
                        <Icon size={17} strokeWidth={1.7} />
                        {label}
                    </NavLink>
                ))}
            </nav>
            <footer className="sidebar-footer">
                <ThemeSwitcher />
                <span className="signed-in-label">Signed in as</span>
                <span className="signed-in-name">{identity?.displayName}</span>
                <Button variant="ghost" className="logout-button" onClick={() => void logout()}>
                    <LogOut size={15} />
                    Sign out
                </Button>
            </footer>
        </>
    );
}
export function AppLayout() {
    const [open, setOpen] = useState(false);
    const main = useRef<HTMLElement>(null);
    const location = useLocation();
    useEffect(() => {
        const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (preference?.matches || !main.current?.animate) return;
        const entrance = main.current.animate(
            [
                { opacity: 0, transform: 'translateY(10px)' },
                { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 360, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
        );
        const stop = () => {
            if (preference?.matches) entrance.cancel();
        };
        preference?.addEventListener('change', stop);
        return () => {
            entrance.cancel();
            preference?.removeEventListener('change', stop);
        };
    }, [location.pathname]);
    useEffect(() => {
        setOpen(false);
        const name = links.find(([path]) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)))?.[1];
        document.title = `${name ?? 'Admin'} · SigMod`;
    }, [location.pathname]);
    return (
        <div className="app-shell">
            <aside className="desktop-sidebar">
                <Navigation />
            </aside>
            <div className="workspace">
                <div className="mobile-topbar">
                    <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setOpen(true)}>
                        <Menu />
                    </Button>
                    <strong>SigMod Admin</strong>
                </div>
                <main ref={main} id="main-content" className="main-content" tabIndex={-1}>
                    <Outlet />
                </main>
            </div>
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="left" className="mobile-sidebar">
                    <SheetTitle className="sr-only">Navigation</SheetTitle>
                    <SheetDescription className="sr-only">Navigate between administration pages or sign out.</SheetDescription>
                    <Navigation onNavigate={() => setOpen(false)} />
                </SheetContent>
            </Sheet>
        </div>
    );
}
