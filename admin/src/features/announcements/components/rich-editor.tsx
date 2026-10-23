import { useEffect, useState } from 'react';
import { EditorContent, useEditor as useTiptapEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import LinkExtension from '@tiptap/extension-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const extensions = [
    StarterKit.configure({
        link: false,
        underline: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        heading: { levels: [2, 3] },
    }),
    Underline,
    LinkExtension.configure({ openOnClick: false, protocols: ['https'] }),
];

export function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
    const editor = useTiptapEditor({
        extensions,
        content: value,
        editorProps: { attributes: { 'aria-label': 'Article body', role: 'textbox', 'aria-multiline': 'true' } },
        onUpdate: ({ editor: current }) => onChange(current.getHTML()),
    });
    const [link, setLink] = useState('');
    useEffect(() => {
        if (editor && editor.getHTML() !== value) editor.commands.setContent(value, { emitUpdate: false });
    }, [editor, value]);
    if (!editor) return null;
    const command = (action: () => void) => {
        action();
        editor.commands.focus();
    };
    const applyLink = () => {
        if (/^https:\/\//i.test(link.trim())) command(() => editor.chain().extendMarkRange('link').setLink({ href: link.trim() }).run());
    };
    return (
        <div>
            <div className="toolbar" role="toolbar" aria-label="Article formatting">
                <Button type="button" variant="outline" onClick={() => command(() => editor.chain().toggleHeading({ level: 2 }).run())}>
                    H2
                </Button>
                <Button type="button" variant="outline" onClick={() => command(() => editor.chain().toggleHeading({ level: 3 }).run())}>
                    H3
                </Button>
                <Button type="button" variant="outline" onClick={() => command(() => editor.chain().toggleBold().run())}>
                    <strong>B</strong>
                </Button>
                <Button type="button" variant="outline" onClick={() => command(() => editor.chain().toggleItalic().run())}>
                    <em>I</em>
                </Button>
                <Button type="button" variant="outline" onClick={() => command(() => editor.chain().toggleUnderline().run())}>
                    <u>U</u>
                </Button>
                <Button type="button" variant="outline" onClick={() => command(() => editor.chain().toggleBulletList().run())}>
                    Bullets
                </Button>
                <Button type="button" variant="outline" onClick={() => command(() => editor.chain().toggleOrderedList().run())}>
                    Numbers
                </Button>
                <Button type="button" variant="outline" onClick={() => command(() => editor.chain().toggleBlockquote().run())}>
                    Quote
                </Button>
                <Button type="button" variant="outline" onClick={() => editor.chain().focus().unsetLink().run()}>
                    Remove link
                </Button>
            </div>
            <div className="toolbar" aria-label="Link controls">
                <Input
                    aria-label="HTTPS link URL"
                    type="url"
                    placeholder="https://…"
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            applyLink();
                        }
                    }}
                />
                <Button type="button" variant="outline" disabled={!/^https:\/\//i.test(link.trim())} onClick={applyLink}>
                    Apply link to selection
                </Button>
            </div>
            <EditorContent editor={editor} className="rich-editor" />
        </div>
    );
}
