import { useId, useState } from 'react';
import { api } from '@/lib/api';
import { Field } from './page';
import { Input } from './ui/input';
export function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    const id = useId();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    return (
        <Field label={label} htmlFor={id} error={error} hint="Image URL or upload PNG, JPEG or WebP, up to 12 MiB.">
            <Input id={id} type="url" value={value} onChange={(event) => onChange(event.target.value)} />
            <Input
                aria-label={`Upload ${label.toLowerCase()}`}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                disabled={pending}
                onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    setPending(true);
                    setError('');
                    try {
                        const result = await api.upload(file);
                        onChange(result.url);
                    } catch (failure) {
                        setError(failure instanceof Error ? failure.message : 'Upload failed.');
                    } finally {
                        setPending(false);
                    }
                }}
            />
            {pending && <span role="status">Uploading…</span>}
        </Field>
    );
}
