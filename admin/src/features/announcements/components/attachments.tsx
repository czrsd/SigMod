import { useState } from 'react';
import { api } from '@/lib/api';
import { Field } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function Attachments({ images, onChange }: { images: string[]; onChange: (value: string[]) => void }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    return (
        <Field label="Article images" hint={`${images.length}/12 images`}>
            <ol>
                {images.map((image, index) => (
                    <li key={`${image}-${index}`}>
                        <Input
                            aria-label={`Image ${index + 1} URL`}
                            value={image}
                            onChange={(e) => onChange(images.map((value, i) => (i === index ? e.target.value : value)))}
                        />
                        <div className="toolbar">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={index === 0}
                                onClick={() => onChange(move(images, index, index - 1))}
                            >
                                Move up
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={index === images.length - 1}
                                onClick={() => onChange(move(images, index, index + 1))}
                            >
                                Move down
                            </Button>
                            <Button type="button" variant="destructive" onClick={() => onChange(images.filter((_, i) => i !== index))}>
                                Remove
                            </Button>
                        </div>
                    </li>
                ))}
            </ol>
            <Input
                type="file"
                aria-label="Upload article image"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                disabled={busy || images.length >= 12}
                onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    setBusy(true);
                    setError('');
                    try {
                        onChange([...images, (await api.upload(file)).url]);
                    } catch (failure) {
                        setError(failure instanceof Error ? failure.message : 'Upload failed.');
                    } finally {
                        setBusy(false);
                    }
                }}
            />
            {busy && <span role="status">Uploading image…</span>}
            {error && (
                <p className="field-error" role="alert">
                    {error}
                </p>
            )}
        </Field>
    );
}
function move<T>(items: T[], from: number, to: number): T[] {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}
