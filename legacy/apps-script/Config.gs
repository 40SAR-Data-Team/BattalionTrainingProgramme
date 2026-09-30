/**
 * Worksheet (tab) names, one per company. Add/remove entries here when
 * onboarding a new company; each must have a matching calendar (see
 * calendarNameForSheet in code.gs).
 */
const COMPANIES = ['Archer', 'Braves', 'Cougar', 'Stallion', 'Hercules'];

// 1-indexed columns. Row 1 is the header row.
const COLUMNS = {
  ID: 1,
  EVENT: 2,
  INSTRUCTOR: 3,
  LOCATION: 4,
  START_DATE: 5,
  START_TIME: 6,
  END_DATE: 7,
  END_TIME: 8,
  RESOURCES: 9,
  COMMENTS: 10,
  STATUS: 11,
};

const HEADER_ROW = 1;
// Key used to tag calendar events with their sheet row's Id (extended property).
const ROW_ID_PROPERTY = 'rowId';

// Max requests per UrlFetchApp.fetchAll() call when batching Calendar API writes.
const BATCH_SIZE = 40;
// Max retry attempts for a request that comes back rate-limited from a batch.
const MAX_RETRY_ATTEMPTS = 5;
// CacheService key used to publish resync progress for the progress dialog to poll.
const PROGRESS_CACHE_KEY = 'resyncProgress';

// Header labels, in the same order as COLUMNS. Used by initializeSheets.
const HEADERS = [
  'Id', 'Event', 'Instructor', 'Location',
  'Start Date', 'Start Time', 'End Date', 'End Time',
  'Resources', 'Comments', 'Status',
];
