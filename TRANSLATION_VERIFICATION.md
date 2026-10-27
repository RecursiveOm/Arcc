# Hindi and Marathi transcript support — 2026-10-05

Implemented: explicit or automatic speech-language selection; original Whisper transcription;
bounded Hindi/Marathi-to-English text translation before indexing and analysis; persistent
per-batch progress; English/original/both transcript views; timestamped UTF-8 downloads;
and opt-in conversion of existing saved Hindi/Marathi transcripts.

Original speech text, detected/selected source language and timestamps are retained.
Existing English processing skips translation. The current backend LLM service provides
translation, including its cache, bounded retries, JSON validation and repair. No provider
configuration, database schema, embedding model or ML algorithm was replaced.

Verification:

- Backend: **55 passed**, including seven focused translation cases. Covers both source
  languages, exact timestamps/original text, cached reuse, partial failure and resume,
  English-only analysis input, rejection/repair of reordered or missing segments, speech
  recognition mode, language hints and existing-transcript conversion.
- Frontend lint, TypeScript and production build: **passed**.
- Browser: all **nine cases passed** across the regression run and a focused rerun of one
  initially failing case. The initial failure was changed empty-search copy; existing
  English wording was restored. New bilingual cases cover English/original/both views,
  searching, download filenames, language selection and honest pending-translation display.
- One small live structured translation request contained one Marathi and one Hindi
  sentence. Both returned: “Today we will learn about machine learning.” The configured
  backend provider was used; no credentials or user transcripts were recorded.
- No expensive video processing or new model downloads were run. Full live Hindi/Marathi
  audio-recognition quality has **not** been evaluated in this change; speech recognition
  is mocked in focused tests. The live check verifies text translation only.

A pre-existing Next.js cache symlink pointed into a deleted temporary directory. Recreating
its temporary target allowed the browser/build checks to run. Existing unrelated frontend
work in the checkout was preserved.
