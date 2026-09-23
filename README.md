# ARC

**Understand every moment.** A local-first video intelligence workspace. Paste a public YouTube video URL or upload media, then explore saved summaries, chronological chapters, timestamped transcripts, study notes, discovered topics, and evidence-grounded chat.

## Run locally

Requirements: Python 3.11–3.12 (tested with 3.12), Node.js 20.9+ (tested with 24), FFmpeg including ffprobe, and a user-provided OpenRouter API key. Allow several GB for dependencies and model weights. No GPU is required.

Install FFmpeg with `sudo apt install ffmpeg` on Ubuntu/Debian or `brew install ffmpeg` on macOS. Verify `ffmpeg -version` and `ffprobe -version`.

From this project directory:

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install --upgrade pip
# Linux CPU installation avoids downloading unnecessary CUDA packages:
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set `OPENROUTER_API_KEY` to your own key. The key stays in the backend environment and is never returned to the browser. The default route is `openrouter/free` at `https://openrouter.ai/api/v1`. Set `LLM_BASE_URL`, `LLM_MODEL`, and optionally `LLM_FALLBACK_MODEL` (default `nvidia/nemotron-3-ultra-550b-a55b:free`). `LLM_API_KEY` optionally overrides the OpenRouter key for another compatible provider. An empty fallback disables fallback; automatic fallback must be a free route. The old `DEEPSEEK_*` variables are ignored. Restart the backend after changing environment configuration. On macOS, install torch from the regular package index instead of the Linux CPU index. For CUDA, install a compatible PyTorch/CTranslate2/CUDA stack; set `WHISPER_DEVICE=cpu` if your CUDA libraries are unavailable.

Start the backend in one terminal:

```bash
source backend/.venv/bin/activate
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Start the frontend in another:

```bash
cd frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:3000**. API documentation is at http://127.0.0.1:8000/docs. The frontend proxies `/api` to the local backend. Use one backend process; do not use multiple Uvicorn workers. Bind to localhost: this POC is for one local user and deliberately has no authentication.

For a production frontend build: `npm run build && npm start` from `frontend/`.

## Architecture

```text
Next.js / TypeScript / Tailwind
             │ same-origin /api proxy
             ▼
FastAPI ─ SQLite metadata, transcript, chunks, analysis, chat, LLM cache
    │
    └─ one background processing worker
       Video → FFmpeg audio → faster-whisper → timestamped chunks
         → local SentenceTransformer → persistent Chroma vectors
         → K-Means + Silhouette selection + PCA
         → OpenRouter topic names + hierarchical summary / chapters / study notes

Question → local embedding → current-video Chroma retrieval (+ bounded neighbors)
         → OpenRouter with evidence only → answer + validated clickable citations
```

- `backend/app/main.py`: validated API inputs, streamed uploads, duplicate detection, local-origin checks, media serving.
- `media.py`, `transcript.py`, `pipeline.py`: media processing, speech recognition, cleanup, chunking, persistent stages and resumable jobs.
- `vectors.py`, `ml.py`: local embeddings, isolated retrieval, explicit classical ML.
- `llm.py`, `chat.py`: one reusable OpenRouter client, structured validation/repair, cached hierarchical analysis, grounded Q&A.
- `frontend/`: responsive workspace, native/YouTube player seeking, library, processing states, light/dark/system themes.
- `data/`: SQLite, Chroma, uploaded playback media. Ignored by Git. Models are cached by Hugging Face separately.

## Inputs and workflow

Supported: `.mp4`, `.mov`, `.webm`, `.mkv`, `.mp3`, `.wav`, `.m4a`, and public YouTube watch/shorts/live links or `youtu.be` links. Default upload limit: 1 GB. Files are streamed in 1 MB reads, assigned generated internal paths, and checked with ffprobe. Uploaded media is converted to browser-playable H.264/AAC (or AAC for audio).

Stages are real database states: queued, downloading, extracting audio, preparing playback, transcription (with elapsed source time), structuring, embedding, topic discovery, analysis, ready. The UI never marks a failed job ready. Original Whisper text is preserved alongside whitespace-cleaned segments. Temporary WAV files are removed. Uploaded playback is retained; YouTube audio is removed after transcription.

YouTube IDs and upload SHA-256 hashes prevent repeated processing. The same input opens the existing result. Failed items expose **Retry**. Completed transcription, embeddings, ML metadata, and intermediate LLM summaries are reused. A backend restart marks interrupted jobs failed, allowing an explicit retry. Ready results are read from storage, not regenerated.

Click a chapter, transcript timestamp, topic-map point, or chat citation to seek the player. Time range inputs accept seconds, `MM:SS`, or `HH:MM:SS`. Range evidence includes whole Whisper segments **entirely inside** the requested interval, excluding overlapping boundary utterances. Empty ranges produce an explicit insufficient-evidence answer.

## The explicit machine-learning component

ARC has no labeled video-topic dataset, so topic discovery is an **unsupervised learning** problem. SentenceTransformer embeddings provide semantic features; K-Means groups similar transcript sections without labeled training examples.

- **Whisper:** pretrained speech recognition with automatic language detection. Default multilingual `small`, CPU int8 or detected CUDA float16. English, Hindi, and Marathi quality depends on the source audio and model size.
- **SentenceTransformer:** pretrained multilingual semantic embeddings, using `paraphrase-multilingual-MiniLM-L12-v2`. Transcript chunks target roughly 500 tokens with modest overlap and preserve original segment boundaries. Because MiniLM has a shorter input limit, ARC tokenizes into model-sized windows and pools their normalized embeddings, covering each chunk's full text.
- **K-Means:** ARC's explicit clustering algorithm. Candidate K is bounded by 8, distinct-vector count, chunk count minus one, and approximately half the chunk count. Uses `n_init=10`, `random_state=42`.
- **Silhouette Score:** selects the best candidate K by cohesion/separation; scoring samples at most 1,000 chunks. Fewer than four chunks or identical vectors use one group with a null score. A score describes the partition, not a confidence estimate that topics are objectively correct.
- **Centroid representatives:** the three nearest chunks per cluster supply the evidence for OpenRouter's topic labels. Labels are generated, not hardcoded.
- **PCA:** projects embeddings to two dimensions for a clickable topic map. Distances in a 2D projection are approximate. One/identical-vector inputs have safe zero coordinates.
- **OpenRouter:** natural-language synthesis and Q&A, distinct from the classical ML stage.

Each chunk persists its cluster ID and source timestamps. Topic transitions in chronological chunk order guide final chapter refinement; chapters are not one-per-cluster. Model references are validated and converted to actual chunk start times. ML failures produce a visible warning and leave transcript analysis usable instead of corrupting the job.

## Token use, grounding, and privacy

Long transcripts use bounded section summaries and recursive reduction, with persistent content-addressed caching. One structured final request creates all summary views and chapters. Topic labels receive only representative excerpts. The client requests strict JSON in the prompt and asks the free router for JSON-capable models via JSON object mode; the fallback uses prompt-only JSON without assuming native schema support, uses Pydantic validation, one bounded schema repair, at most two primary attempts, one free fallback, and one schema repair (four HTTP attempts maximum per structured request), and explicit errors for credentials, credit, rate limits, empty responses, and timeouts. HTTP 429 honors Retry-After up to 60 seconds; longer cooldowns fail without an early retry. Optional reasoning is disabled to reserve the existing 6,000-token output budget for the answer; a route that requires reasoning is retried at low effort within the existing primary-attempt budget. Upstream errors inside HTTP 200 responses are handled as errors. Successful LLM results are cached by endpoint, routes, schema and source content.

Chat embeds the question locally, retrieves up to five chunks from **only the selected video**, adds at most two neighboring chunks, and caps evidence at 20,000 characters. Range chat ranks only in-range content locally. Recent conversation is bounded and marked as non-evidence. Model evidence IDs must point to supplied excerpts before citation chips are returned. Prompt instructions require insufficient-evidence answers; as with any LLM, users should check cited moments. Responses are displayed as text, not executable HTML.

The key is configured through `.env`, not a browser input. OpenRouter and its routed model provider receive transcript excerpts, section summaries, and bounded recent chat. YouTube ingestion/playback and initial model downloads require internet access. Everything except OpenRouter inference runs locally. No other paid API is used.

The implementation follows [OpenRouter free-router documentation](https://openrouter.ai/openrouter/free) and [SentenceTransformer input-length documentation](https://www.sbert.net/docs/package_reference/sentence_transformer/model.html).

## Verification

```bash
source backend/.venv/bin/activate
pytest backend/tests -q
cd frontend
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

Backend tests exercise real SQLite, real scikit-learn, real temporary Chroma isolation, validation, chunking, range filtering, bounded RAG context, duplicate ingestion, failed/resumed jobs, model JSON repair/cache, and citation validation. External model/LLM operations are mocked where appropriate; automated tests do not spend API credits. Browser tests use explicit API fixtures for major UI flows. These are not substitutes for live acceptance.

For an original small local fixture, install `espeak`, then run:

```bash
./scripts/create_fixture.sh
```

Upload `/tmp/arc-fixture/arc-lesson.mp4`. Wait for **Ready**, inspect the transcript/summary/topic map, ask “What is the main topic of this video?”, then click a citation and check playback time. Also try a short public YouTube video, such as `https://www.youtube.com/watch?v=jNQXAC9IVRw`. Check `VERIFICATION.md` for the actual results obtained in this environment.

## POC limits

- First use downloads model weights; slow networks and CPU transcription can take substantial time. No distributed processing, GPU requirement, diarization, or model training.
- YouTube may reject datacenter IPs, require login, or disallow embeds. Update `yt-dlp`; otherwise use an authorized local file. ARC does not bypass access controls, authentication, or DRM.
- Speech-only intelligence: no analysis of silent visual content, slides, or on-screen text. Transcription errors affect summaries and retrieval.
- Analysis and chat use an OpenRouter free route with a user-provided key. Free-tier quotas, rate limits, and availability apply; the actual model/provider can vary between requests. When unavailable, local transcript, indexing and topic coordinates still persist, and the failed job can resume once configured.
- Chat returns complete validated replies rather than streaming partial JSON. Range queries re-embed bounded source sections when asked; normal chat reuses stored Chroma vectors.
- Work is sequential in one process. Shutdown waits for an active task; a forced interruption may require retry. Deletion is available after processing ends.
- Local storage is not encrypted and there is no authentication. Do not expose this server to a shared/public network.
