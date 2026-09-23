# ARC free-LLM migration verification — 2026-09-24

## Provider

OpenRouter is the default: `https://openrouter.ai/api/v1`, route `openrouter/free`, optional fallback `nvidia/nemotron-3-ultra-550b-a55b:free`. Configuration and the API key stay on the backend. Automatic paid fallback is rejected. Existing caching, token budgets, Pydantic validation, one JSON repair, grounded citations and resumable processing remain in place. Attempts are bounded; Retry-After is respected, with long cooldowns reported instead of retried early.

Genuine successful live outputs came from `nvidia/nemotron-3-ultra-550b-a55b:free`, `poolside/laguna-s-2.1:free`, `dots-studio/dots-3-note-preview:free`, and `nex-agi/nex-n2.5-mini:free`. Reported usage costs were zero. No live responses were mocked. The route chooses models dynamically; this does not establish that a specific DeepSeek free model is available.

## Automated final gate

The complete regression ran once after both live acceptances: backend **48 passed**; frontend lint **passed**; TypeScript **passed**; production build **passed**; Playwright **3 passed**. Focused provider tests preceded live acceptance. Automated external LLM responses and browser API fixtures are mocked and consume no provider quota. Backend emitted two dependency deprecation warnings; no test failures occurred.

## Two fresh real acceptance videos

Isolated data: `data/acceptance-20260923`. Existing user records were not deleted or overwritten. Recorded stage events establish that each video's extraction, real Whisper transcription, chunking, local embedding insertion and ML discovery executed exactly once. A's YouTube download and B's upload playback preparation also executed once. Failed LLM stages were resumed using successful local artifacts; no retranscription, re-embedding or reclustering occurred.

| Check | Video A | Video B |
| --- | --- | --- |
| Ingestion | YouTube: [Pourquoi le ciel est bleu ?](https://www.youtube.com/watch?v=nQDY2sJKx2s) | Local MP4 upload: [Julian Treasure, How to Speak So That People Want to Listen](https://www.youtube.com/watch?v=eIho2S0ZahI) |
| Duration | 208.43 seconds (3:28) | 598.05 seconds (9:58) |
| Fresh processing | YES | YES |
| Real Whisper / language | 80 timestamped segments / French | 235 timestamped segments / English |
| Timestamped chunks | 3 | 5 |
| Local embeddings / Chroma | 3 × 384, passed | 5 × 384, passed |
| ML | Correct single-topic fallback, K=1 | Real K-Means, silhouette selection, centroid representatives and PCA |
| Genuine LLM analysis | Passed | Passed |
| Overview / quick and detailed summary | Passed; 4 detailed sections | Passed; 6 detailed sections |
| Key takeaways / study notes | 5 / 3 | 6 / 4 |
| Topics / important moments | 7 / 3 | 7 / 5 |
| Chapters / timeline | 3 | 5 |
| Factual RAG | Both questions passed with timestamp citations | Both questions passed with timestamp citations |
| Real transcript seek | Target 15.44s, actual 15.44s | Target 15.72s, actual 15.72s |
| Real citation seek | Target 67.12s, actual 67.35s | Target 122.58s, actual 122.58s |
| Real chapter seek | Not required for A | Target 122.58s, actual 122.58s |

### Video B: measured ML values

- Embedding matrix: **(5, 384)**.
- Candidate K: **2**, silhouette **0.21858970820903778**. The existing sample-size bound permits only this candidate.
- Selected K: **2**; cluster sizes **0: 2, 1: 3**.
- Cluster 0 centroid representatives, in distance order: chunk **0** (13.84–140.42s), chunk **1** (122.58–255.38s).
- Cluster 1 centroid representatives: chunk **3** (348.46–481.77s), chunk **2** (242.42–363.70s), chunk **4** (469.45–590.19s).
- PCA output: **(5, 2)**; five points rendered in the real browser.
- Generated cluster labels: “Powerful speaking through honesty, authenticity, integrity, and love”; “Voice techniques, prosody, and vocal warm-ups”.

### RAG and range acceptance

Exactly two factual questions per video were used:

1. A: “What is the main scientific explanation for the color of the sky?” — correctly explained Rayleigh scattering and eye sensitivity.
2. A: “Why do sunsets appear red, and what happens to the sky color at higher altitudes?” — correctly explained the longer atmospheric path and darker sky at altitude.
3. B: “What are the main principles of speaking so that people want to listen?” — correctly described HAIL, speaking habits and delivery.
4. B: “What does HAIL stand for, and why does the speaker combine honesty with love?” — correctly expanded HAIL and explained kindness tempering honesty.

Actual local retrieval used the current video's evidence and bounded context; answers passed citation validation. One logical range test on B asked “Explain only this section.” for **300–420s**. It passed with evidence/citations **302.02–408.73s** and **408.73–418.45s**, wholly inside the selected interval. It explained vocal register, timbre, prosody, pace, silence, pitch and volume. Only genuine failed requests were retried; no successful chat or analysis was regenerated for reassurance.

The browser exercised actual YouTube/HTML5 players and saved LLM answers. Runtime errors: **none**. This live browser evidence is separate from the mocked automated Playwright suite.

## Acceptance checklist

YouTube ingestion ✅ · Upload ingestion ✅ · FFmpeg ✅ · Whisper ✅ · Chunking ✅ · Embeddings ✅ · Chroma ✅ · K-Means ✅ · Silhouette ✅ · PCA ✅ · Free LLM ✅ · Summary ✅ · Timeline ✅ · Study Notes ✅ · RAG ✅ · Citations ✅ · Player seek ✅ · Range chat ✅

Fresh processing verified: **Video A YES; Video B YES**.

## Evidence and limitations

Evidence retained under the isolated data directory: `events.jsonl`, `chat-results.json`, `browser-results.json`, screenshots, and the completed database/media/vector artifacts. Observation wrappers called the real pipeline; no synthetic transcripts, embeddings, ML metrics or LLM outputs were substituted.

The free route produced real temporary 503 failures and model capability differences, including empty/reasoning-only or schema-invalid output. Bounded retries, one repair and the configured free fallback ultimately completed acceptance. Free-tier availability and future success are not guaranteed. Video B's five chunks and silhouette 0.2186 demonstrate execution, not strong statistical cluster separation. Whisper transcripts contain ordinary recognition errors. No remaining blocker was observed in these acceptance runs.
