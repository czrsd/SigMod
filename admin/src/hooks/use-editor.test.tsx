import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { createMemoryRouter, Link, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmProvider } from '@/components/confirm-action';
import { UnsavedChangesProvider } from '@/components/unsaved-changes';
import { useEditor } from './use-editor';

afterEach(() => cleanup());

function EditorHarness({ saved }: { saved: { title: string } }) {
    const editor = useEditor(saved);
    return (
        <div>
            <output data-testid="draft">{editor.draft?.title}</output>
            <output data-testid="dirty">{String(editor.dirty)}</output>
            <button onClick={() => editor.setDraft({ title: 'local edit' })}>Edit</button>
            <button onClick={() => editor.reset()}>Reset</button>
            <button onClick={() => editor.accept({ title: 'saved remotely' })}>Accept</button>
        </div>
    );
}

describe('useEditor', () => {
    it('keeps a dirty draft during server refetches, and refreshes a clean draft for equivalent new objects', async () => {
        const first = { title: 'initial' };
        const { rerender } = render(<EditorHarness saved={first} />);
        expect(screen.getByTestId('draft')).toHaveTextContent('initial');

        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(screen.getByTestId('dirty')).toHaveTextContent('true');
        rerender(<EditorHarness saved={{ title: 'server update' }} />);
        expect(screen.getByTestId('draft')).toHaveTextContent('local edit');

        fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
        expect(screen.getByTestId('draft')).toHaveTextContent('server update');
        expect(screen.getByTestId('dirty')).toHaveTextContent('false');
        rerender(<EditorHarness saved={{ title: 'server update' }} />);
        expect(screen.getByTestId('dirty')).toHaveTextContent('false');
    });

    it('accepts a saved value as the new clean baseline', () => {
        render(<EditorHarness saved={{ title: 'initial' }} />);
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
        expect(screen.getByTestId('draft')).toHaveTextContent('saved remotely');
        expect(screen.getByTestId('dirty')).toHaveTextContent('false');
    });

    it('does not rerender continuously when clean parents pass equivalent object instances', async () => {
        let renders = 0;
        function Probe() {
            renders++;
            const [revision, setRevision] = useState(0);
            useEditor({ title: 'same value' });
            return <button onClick={() => setRevision(revision + 1)}>Render parent</button>;
        }
        render(<Probe />);
        const afterMount = renders;
        fireEvent.click(screen.getByRole('button', { name: 'Render parent' }));
        await waitFor(() => expect(renders).toBe(afterMount + 1));
    });
});

function GuardedEditor({ id }: { id: string }) {
    const editor = useEditor({ title: id });
    return <button onClick={() => editor.setDraft({ title: 'changed' })}>Edit {id}</button>;
}

function CurrentLocation() {
    return <output data-testid="location">{useLocation().pathname}</output>;
}
function GuardRoot() {
    return (
        <ConfirmProvider>
            <UnsavedChangesProvider>
                <Outlet />
            </UnsavedChangesProvider>
        </ConfirmProvider>
    );
}

describe('unsaved editor navigation guard', () => {
    it('blocks route changes while any editor is dirty, resumes after confirmation, and allows navigation when clean', async () => {
        const router = createMemoryRouter(
            [
                {
                    element: <GuardRoot />,
                    children: [
                        {
                            path: '/edit',
                            element: (
                                <>
                                    <GuardedEditor id="one" />
                                    <GuardedEditor id="two" />
                                    <Link to="/next">Next</Link>
                                    <CurrentLocation />
                                </>
                            ),
                        },
                        {
                            path: '/next',
                            element: (
                                <>
                                    <p>Next page</p>
                                    <CurrentLocation />
                                </>
                            ),
                        },
                    ],
                },
            ],
            { initialEntries: ['/edit'] }
        );
        render(<RouterProvider router={router} />);

        fireEvent.click(screen.getByRole('button', { name: 'Edit one' }));
        fireEvent.click(screen.getByRole('link', { name: 'Next' }));
        expect(await screen.findByRole('heading', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/edit'));

        fireEvent.click(screen.getByRole('button', { name: 'Edit two' }));
        fireEvent.click(screen.getByRole('button', { name: 'Edit two' }));
        fireEvent.click(screen.getByRole('link', { name: 'Next' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
        expect(await screen.findByText('Next page')).toBeInTheDocument();
    });
});
