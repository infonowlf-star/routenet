# Fix blocked YouTube download handling

## Outcome
- A temporary YouTube bot check will no longer trigger a runtime crash or blank screen.
- Already-downloaded songs will continue playing from their saved local copy.
- Failed new downloads will stop cleanly and show the existing recoverable error message.

## Changes
1. Return blocked/unavailable media results as structured non-crashing responses from every `public-download` path, not only URL resolution.
2. Teach the browser download service to recognize those structured responses and finish safely without interpreting them as media bytes.
3. Preserve the current IndexedDB-first playback behavior and network fallback order.
4. Deploy the updated function and test the blocked response plus the now-playing screen.

## Technical details
- Use an HTTP success response with `ok: false`, `code`, and `retryable` for expected upstream YouTube blocks.
- Add a response marker/header so media-fetch code can distinguish JSON failure payloads from audio streams.
- Keep genuine malformed requests and unsafe URLs as HTTP errors.
