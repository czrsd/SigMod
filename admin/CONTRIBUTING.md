# Dashboard implementation contracts

Never expose secrets in output. Preserve existing changes outside your scope.

Stack: React, TypeScript strict, Vite, shadcn/ui, Tailwind, React Router, TanStack Query. Import shared UI via `@/components/ui/*`, utilities via `@/lib/*`. Feature modules live in `src/features/<feature>/`. Each feature exports named page components from its own `index.tsx`; root owns routing and layout. Read docs/admin-api.md and actual server routes for exact shapes. No invented API endpoints, browser storage of personal records, fake production data, or explicit any.

Root provides these shared contracts (files may appear while you work):

- `@/lib/api`: `api.get<T>(path, signal?)`, `api.post<T>(path, body)`, `api.put<T>(path, body)`, `api.patch<T>(path, body)`, `api.upload(file): Promise<{url:string;bytes:number}>`. Paths begin `/stats`, `/alert`, etc relative to `/api/v5/admin`. The client unwraps `{success:true,data:T}`, otherwise returns raw payload. `ApiError` has `status:number`, `uncertain:boolean`. Writes handle CSRF centrally and are never automatically retried.
- `@/components/page`: `PageHeader({title,description?,actions?})`, `QueryState({isPending,error?,onRetry?,children})`, `EmptyState({title,description?})`, `Field({label,htmlFor?,hint?,error?,children})`, `SaveMessage({error?,saved?})`.
- `@/lib/format`: `formatDate(value:unknown)`, `formatNumber(value:number|null|undefined)`, `formatBytes(value:number|null|undefined)`, `displayValue(value:unknown)`.
- `@/hooks/use-editor`: `useEditor<T extends object>(saved:T|undefined)` returns `{draft:T|null,setDraft:Dispatch<SetStateAction<T|null>>,dirty:boolean,reset:()=>void,accept:(value:T)=>void}`. Preserves dirty drafts on refetch, guards route navigation/beforeunload. Additional methods/messages can be requested from root. Use on actual editor subcomponents to avoid hook conditional-render problems. Revision-bearing writes send the saved draft's revision and show 409 conflicts without auto-overwrite. Store nothing in localStorage.
- `@/components/confirm-action`: `useConfirm(): (options:{title:string;description:string;confirmLabel?:string;destructive?:boolean})=>Promise<boolean>`.
- UI components generated: Button, Input, Textarea, Label, Switch, Dialog, Tabs, Table, Separator, Sheet, Tooltip. Prefer native select with className `native-select` for simple options; shadcn styled elsewhere. `Button` standard variants default/outline/ghost/destructive and sizes default/sm/icon.
- `@/components/image-field`: `ImageField({label,value,onChange})` handles URL and upload.

Use TanStack `useQuery` and `useMutation` directly; query keys begin feature name; cancel reads with queryFn signal. Use semantic HTML, labels, text rendering, existing primitives and CSS classes `page-stack`, `section`, `section-title`, `muted`, `form-grid`, `editor-layout`, `preview-panel`, `toolbar`, `table-wrap`, `detail-grid`, `data-row`, `native-select`, `field-error`. Do not build nested shells, global styles, or custom auth per tab. No decorative badges, massive card grids or stub actions.

Routes/export names:

- features/stats: `StatsPage` at `/`
- features/sigmally-users: `SigmallyUsersPage` at `/sigmally-users`, `SigmallyUserPage` at `/sigmally-users/:id`
- features/sigmod-users: `SigmodUsersPage` at `/sigmod-users`, `SigmodUserPage` at `/sigmod-users/:id`
- features/settings-usage: `SettingsUsagePage` at `/settings-usage`
- features/announcements: `AnnouncementsPage` at `/announcements`, `AnnouncementEditorPage` at `/announcements/new` and `/announcements/:id`
- features/alerts: `AlertsPage` at `/alerts`
- features/chat-filter: `ChatFilterPage` at `/chat-filter`
- features/translations: `TranslationsPage` at `/translations`
- features/promotions: `PromotionsPage` at `/promotions`, `PromotionEditorPage` at `/promotions/new` and `/promotions/:id`

No React wrappers around the game/userscript. Dashboard is a separate frontend served by the v5 backend. Root integrates tests, browser checks, dependencies and server static serving. Report API gaps rather than inventing support.
