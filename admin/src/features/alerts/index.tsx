import { useState } from 'react';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { AlertEditor } from './alert-editor';
import { NoticeEditor } from './update-notice-editor';

type Tab = 'alert' | 'notice';

export function AlertsPage() {
    const [tab, setTab] = useState<Tab>('alert');
    return (
        <div className="page-stack">
            <PageHeader title="Alerts" />
            <div className="toolbar" role="tablist" aria-label="Content type">
                <Button
                    role="tab"
                    aria-selected={tab === 'alert'}
                    variant={tab === 'alert' ? 'default' : 'outline'}
                    onClick={() => setTab('alert')}
                >
                    Alert
                </Button>
                <Button
                    role="tab"
                    aria-selected={tab === 'notice'}
                    variant={tab === 'notice' ? 'default' : 'outline'}
                    onClick={() => setTab('notice')}
                >
                    Update notice
                </Button>
            </div>
            <div hidden={tab !== 'alert'}>
                <AlertEditor />
            </div>
            <div hidden={tab !== 'notice'}>
                <NoticeEditor />
            </div>
        </div>
    );
}
