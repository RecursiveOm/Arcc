# ARC frontend redesign — 2026-09-24

## Scope

Frontend only. Existing APIs, ingestion, processing, database, ML, LLM provider, RAG and citation validation are unchanged. No new UI or animation dependencies. No new videos, transcriptions, embeddings or live LLM requests were run.

## Experience

- Home `/`: focused YouTube input, file upload and recent analyses.
- Library `/library`: search, status filters, sorting, video cards and existing delete action.
- Settings `/settings`: persisted Light / Dark / System preferences, connection and local-processing status.
- Video `/video/[id]`: balanced player and editorial overview, quick/detailed summary, takeaways and source moments.
- Sections `/timeline`, `/transcript`, `/topics`, `/notes`: chapter seeking, transcript search, stored PCA topic map and representatives, copyable notes. `/summary` also resolves to the summary.
- Chat `/video/[id]/chat`: full-page conversation, range composer, suggested questions, loading/error/retry states, history drawer and citation source-player drawer. Uses the existing single conversation per video.
- Legacy `/?video=...` and `/?view=...` links redirect to the new routes.
- Processing uses actual polled stage text for conceptual audio, transcript, structure, embedding, topic and analysis illustrations. It invents no transcript text, counts, clustering results or progress percentages. Saved transcript remains accessible after processing failure.
- A 78px desktop navigation rail replaces permanent history. Mobile uses a native modal navigation drawer, with Escape, focus containment and return focus.
- CSS transitions cover pages, cards, tabs, messages, drawers and themes. Processing motion uses opacity/transforms. Reduced-motion preference disables animation.

## Visual and saved-data verification

Inspected Home, Library, Processing, Overview, Timeline, Transcript, Topics, Study Notes, Chat and Settings in light and dark at desktop 1440px and mobile 390px. Also checked Topics and Chat at tablet 768px and wide desktop 1920px: **44 combinations, no document horizontal overflow and no browser runtime errors**. Processing screenshots use explicitly simulated status responses; no new jobs were submitted. Other pages used stored video analyses.

Used the previous acceptance upload's existing MP4, transcript, chapters and conversation via read-only browser responses to verify real native playback:

| Interaction | Target | Observed player position |
| --- | --- | --- |
| Transcript | 15.72s | 15.82s |
| Chapter | 122.58s | 123.56s (playing) |
| Stored chat citation → mini-player | 122.58s | 122.58s |

The existing YouTube player accepted a stored chapter seek to **140.68s**, reporting **140.68s**. Native playback now queues a citation seek until metadata is available, preserving the requested moment when the drawer mounts. Inspected source-player and history drawers and existing chat messages on desktop/mobile. No new answers were generated.

Screenshots and read-only review results are under `/tmp/arc-ui-review/` (local review artifacts, not committed).

## Final frontend gate

Lint **passed**; standalone TypeScript checking **passed**; production build **passed**. All **7 Playwright scenarios passed** across the final gate and targeted reruns. The complete gate ran once: 3 browser scenarios passed initially; ambiguous selectors, a development badge obscuring Settings, and decorative mobile overflow were corrected. Only the 4 affected scenarios were rerun (one required a further selector correction). Changed test/config files passed lint, and the final CSS/config changes passed a production rebuild including TypeScript. No backend regression was run because no backend files changed.

Coverage: YouTube/upload navigation, all analysis sections, full-page chat, grounded citation display, range request payloads, history/source dialogs and focus restoration, native seek on media readiness, failed-chat retry, multiline input, real-stage polling transitions, legacy links, mobile navigation, library search, persisted/system themes, responsive layouts and reduced motion. Automated external APIs are mocked; no provider quota is spent.

## Environment observation

The home partition exhausted its free space during verification, causing SQLite/media read errors. Only disposable Next.js caches were moved to `/tmp/arc-ui-review/` and linked from the ignored `.next` directory, freeing approximately 225 MB. User data was retained. The disk still has little headroom; this is separate from the frontend changes.

## Visual refresh — midnight / indigo

The subsequent visual-only refresh replaces the serif/olive presentation with locally hosted variable **Geist Sans**, cool-white surfaces (`#F7F8FC`, `#FFFFFF`) and indigo (`#4F46E5`); dark mode uses midnight surfaces (`#0B0D12`, `#11141B`, `#171B24`) and soft indigo (`#818CF8`). Font licensing is included with the local font. Serif declarations, italic headings and the home orbit illustration were removed.

Home now uses a compact heading, horizontal desktop upload row, clear input workspace, four compact feature summaries and three recent analyses. Navigation shares the new surfaces and selected states; the mobile header keeps ARC, context and menu without the desktop status group. Thumbnails have a simple fallback while their external images load.

Verified light/dark Home at **1440, 768 and 390px**: Geist loaded, normal (non-italic) headings, no horizontal overflow, and URL input visible above the fold. Heading sizes measured **61.92 / 44 / 38px**. Library, Settings and Topics were also inspected. No browser runtime errors. Screenshots: `/tmp/arc-indigo-review/`.

**Lint passed; typecheck passed; production build passed; 4 relevant existing Playwright scenarios passed** (ingestion/analysis/chat navigation, upload/themes/library, mobile navigation, responsive/reduced motion). After correcting the mobile header and thumbnail fallback, affected-file lint, production build and a targeted mobile visual check passed. No backend, API, processing or retrieval behavior changed; no videos were processed and no LLM calls were made.
