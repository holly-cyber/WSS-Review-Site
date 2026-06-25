// RSS / Atom sources for the News generator. The canonical list lives in
// src/data/feeds.json, which is editable from the console (News → Generate →
// RSS feeds) — the console reads and writes that JSON via GitHub. This module
// re-exports it so any build-time import keeps working.
import feeds from './feeds.json';
export { feeds };
