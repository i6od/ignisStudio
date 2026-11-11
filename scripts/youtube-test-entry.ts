/**
 * Single bundle entry for scripts/youtube-test.cjs.
 *
 * Re-exporting from one entry keeps a single shared instance of the SQLite
 * modules, so the tracker and the assertions see the same database connection.
 */

export * from '../src/main/youtube-live'
export { getSummary, getTopSupporters, recordYouTubeGift } from '../src/main/db'
export { listMappings, upsertMapping, upsertMessage, getMessage } from '../src/main/youtube-db'
export {
  appendEvent,
  backfillYouTubeText,
  clearEventLog,
  getEventLogStats,
  listEventLog,
  mirrorYouTubeMessage
} from '../src/main/event-log'
