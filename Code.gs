/**
 * Sheets -> Calendar sync. One worksheet per company (see COMPANIES in Config.gs).
 * Events are tagged on the Calendar side with a rowId extended property so rows
 * can be matched to events without a separate mapping table.
 */

/** Adds the "Calendar Sync" menu when the spreadsheet opens. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Calendar Sync')
    .addItem('Initialize Sheets', 'initializeSheets')
    .addItem('Resync', 'resyncActiveSheet')
    .addItem('Install & Verify Triggers', 'installAndVerifyTriggers')
    .addToUi();
}

/** One-time setup: creates any missing company worksheets and writes the header row if blank. */
function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  COMPANIES.forEach(function (name) {
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(HEADER_ROW, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(HEADER_ROW);
    }
  });
}

/** Registers the onEdit trigger, skipping it if it already exists - idempotent, safe to call
 * every time installAndVerifyTriggers runs. */
function installTriggers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const existing = ScriptApp.getProjectTriggers();

  if (!existing.some(function (t) { return t.getHandlerFunction() === 'handleEdit'; })) {
    ScriptApp.newTrigger('handleEdit').forSpreadsheet(ss).onEdit().create();
  }
}

/** Installable onEdit trigger: syncs whichever rows were just edited on a mapped company sheet. */
function handleEdit(e) {
  const sheet = e.range.getSheet();
  if (COMPANIES.indexOf(sheet.getName()) === -1) return;

  reconcileRemovedRowIds(sheet);

  const firstRow = Math.max(e.range.getRow(), HEADER_ROW + 1);
  const lastRow = e.range.getLastRow();
  for (let row = firstRow; row <= lastRow; row++) {
    const values = sheet.getRange(row, 1, 1, COLUMNS.STATUS).getValues()[0];
    if (!values[COLUMNS.EVENT - 1]) continue;
    upsertEventForRow(sheet, row, values);
  }

  // Snapshot AFTER upserts, so any rowId a row just got assigned above is captured -
  // otherwise a row added and later deleted would never appear in the "previous" snapshot
  // and its deletion would go undetected.
  setKnownRowIds(sheet.getName(), getCurrentRowIds(sheet));
}

/** Reads/writes the previous-Id-column snapshot for one sheet, used to detect removed rows
 * across edits Apps Script can't otherwise diff (row deletes, multi-cell edits). */
function getKnownRowIds(sheetName) {
  const raw = PropertiesService.getScriptProperties().getProperty('rowIds_' + sheetName);
  return raw ? JSON.parse(raw) : [];
}

function setKnownRowIds(sheetName, ids) {
  PropertiesService.getScriptProperties().setProperty('rowIds_' + sheetName, JSON.stringify(ids));
}

/** Reads every non-blank value currently in the sheet's Id column. */
function getCurrentRowIds(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROW) return [];
  return sheet.getRange(HEADER_ROW + 1, COLUMNS.ID, lastRow - HEADER_ROW, 1)
    .getValues()
    .map(function (r) { return r[0]; })
    .filter(String);
}

/** Pure: ids present in previousIds but no longer in currentIds. */
function diffRemovedIds(previousIds, currentIds) {
  const currentSet = {};
  currentIds.forEach(function (id) { currentSet[id] = true; });
  return previousIds.filter(function (id) { return !currentSet[id]; });
}

/** Deletes the calendar event tagged with each given rowId, best-effort (one lookup per id). */
function removeEventsForIds(sheetName, ids) {
  if (!ids.length) return;
  const calendarId = getCalendarForCompany(sheetName);
  ids.forEach(function (id) {
    try {
      const existing = findEventById(calendarId, id);
      if (existing) Calendar.Events.remove(calendarId, existing.id);
    } catch (err) {
      // Best-effort cleanup; a bad/stale id just gets skipped.
    }
  });
}

/** Diffs the sheet's Id column against its last-known snapshot and removes the calendar events
 * for any id that disappeared - covers single-cell clears, whole-row deletes, and multi-row
 * deletes alike, since Apps Script only gives us a reliable e.oldValue for single-cell edits.
 * Does NOT refresh the snapshot - callers do that once they know the sheet's final state, so a
 * row created and deleted before the next snapshot isn't missed (see handleEdit/resyncSheet). */
function reconcileRemovedRowIds(sheet) {
  const sheetName = sheet.getName();
  const previousIds = getKnownRowIds(sheetName);
  const currentIds = getCurrentRowIds(sheet);
  removeEventsForIds(sheetName, diffRemovedIds(previousIds, currentIds));
}

/** Menu entry point: resyncs whichever company sheet is currently active, so the "Resync" menu
 * item toggles between companies (Archer, Braves, Cougar, Stallion, Hercules) based on the tab
 * the user has open, instead of resyncing the whole spreadsheet. */
function resyncActiveSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  resyncCompany(sheet.getName());
}

/** Resyncs a single company sheet by name, reporting the outcome via alert. Callable directly
 * from the Apps Script editor for a targeted resync, and from the "Resync" menu item via
 * resyncActiveSheet. */
function resyncCompany(sheetName) {
  const ui = SpreadsheetApp.getUi();
  if (COMPANIES.indexOf(sheetName) === -1) {
    ui.alert('Unknown company "' + sheetName + '". Expected one of: ' + COMPANIES.join(', '));
    return;
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    ui.alert('No sheet found named "' + sheetName + '"');
    return;
  }
  const progress = { current: 0, total: estimateResyncTotal([sheetName]) };
  showResyncProgressDialog(progress.total, 'Starting resync for ' + sheetName + '...');
  resyncSheet(sheet, progress);
  ui.alert('Resync complete for ' + sheetName);
}

/** Counts rows across the given sheets that would attempt a sync (non-blank Event cell), plus one
 * unit per sheet for its deletion-reconciliation pass - used to size the progress bar up front. */
function estimateResyncTotal(sheetNames) {
  let total = 0;
  sheetNames.forEach(function (name) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (!sheet) return;
    total += countEligibleRows(sheet) + 1;
  });
  return total || 1;
}

/** Counts data rows on a sheet that have a non-blank Event cell. */
function countEligibleRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROW) return 0;
  const events = sheet.getRange(HEADER_ROW + 1, COLUMNS.EVENT, lastRow - HEADER_ROW, 1).getValues();
  return events.filter(function (r) { return !!r[0]; }).length;
}

/** Re-syncs every row on one company sheet via a single batched UrlFetchApp.fetchAll call, then
 * deletes calendar events for rows that no longer exist. Mutates the shared progress tracker
 * (see resyncCompany) as it goes. */
function resyncSheet(sheet, progress) {
  const sheetName = sheet.getName();
  const calendarId = getCalendarForCompany(sheetName);
  const lastRow = sheet.getLastRow();

  const rows = [];
  if (lastRow > HEADER_ROW) {
    const data = sheet.getRange(HEADER_ROW + 1, 1, lastRow - HEADER_ROW, COLUMNS.STATUS).getValues();
    data.forEach(function (values, i) {
      if (!values[COLUMNS.EVENT - 1]) return;
      rows.push({ row: HEADER_ROW + 1 + i, values: values });
    });
  }

  const existing = loadExistingEvents(calendarId);
  updateProgress(progress.current, progress.total, 'Loaded ' + sheetName + ' calendar');

  // One plan per eligible row: either a request to send, or an in-place skip reason.
  const plans = rows.map(function (r) {
    const fields = buildEventFields(r.values);
    const currentId = r.values[COLUMNS.ID - 1];
    if (!fields.title || !fields.start) {
      return { row: r.row, skip: 'Skipped: missing Event or Start Date', existingId: currentId };
    }
    let rowId = currentId;
    let eventId = null;
    const isNew = !rowId;
    if (isNew) {
      rowId = Utilities.getUuid();
    } else if (existing.byRowId[rowId]) {
      eventId = existing.byRowId[rowId].id;
    }
    const resource = buildCalendarResource(fields, rowId);
    const request = buildCalendarRequest(calendarId, eventId ? 'patch' : 'post', resource, eventId);
    return { row: r.row, rowId: rowId, isNew: isNew, request: request };
  });

  const toSend = plans.filter(function (p) { return p.request; });
  const results = runBatched(toSend.map(function (p) { return p.request; }), function (batchDone) {
    updateProgress(progress.current + batchDone, progress.total, 'Syncing ' + sheetName);
  });
  progress.current += toSend.length;

  const rowUpdates = {};
  plans.forEach(function (p) {
    if (p.skip) rowUpdates[p.row] = { status: p.skip };
  });
  toSend.forEach(function (p, i) {
    const result = results[i];
    if (result.ok) {
      rowUpdates[p.row] = { id: p.rowId, status: 'Synced ' + new Date().toLocaleString() };
    } else if (p.isNew) {
      // Insert failed before an id was ever confirmed - leave the Id cell untouched.
      rowUpdates[p.row] = { status: 'Error: ' + result.error };
    } else {
      rowUpdates[p.row] = { id: p.rowId, status: 'Error: ' + result.error };
    }
  });
  applyRowUpdates(sheet, rowUpdates);

  const sheetIds = {};
  toSend.forEach(function (p, i) {
    if (results[i].ok || !p.isNew) sheetIds[p.rowId] = true;
  });
  plans.forEach(function (p) {
    if (p.skip && p.existingId) sheetIds[p.existingId] = true;
  });

  runBatched(buildDeletionRequests(calendarId, existing, sheetIds));
  progress.current += 1;
  updateProgress(progress.current, progress.total, sheetName + ' complete');

  setKnownRowIds(sheetName, getCurrentRowIds(sheet));
}

/** Writes a batch of {row: {id?, status}} updates back to the sheet in two ranged setValues calls
 * (one for the Id column, one for Status) instead of one setRange/setValue pair per row. */
function applyRowUpdates(sheet, rowUpdates) {
  const rowNumbers = Object.keys(rowUpdates).map(Number);
  if (!rowNumbers.length) return;
  const minRow = Math.min.apply(null, rowNumbers);
  const maxRow = Math.max.apply(null, rowNumbers);
  const numRows = maxRow - minRow + 1;

  const idRange = sheet.getRange(minRow, COLUMNS.ID, numRows, 1);
  const statusRange = sheet.getRange(minRow, COLUMNS.STATUS, numRows, 1);
  const idValues = idRange.getValues();
  const statusValues = statusRange.getValues();

  rowNumbers.forEach(function (row) {
    const update = rowUpdates[row];
    const i = row - minRow;
    if (update.id !== undefined) idValues[i][0] = update.id;
    statusValues[i][0] = update.status;
  });

  idRange.setValues(idValues);
  statusRange.setValues(statusValues);
}

/** Creates or updates the calendar event for one sheet row, writing the result to the Status column. */
function upsertEventForRow(sheet, row, values) {
  try {
    const calendarId = getCalendarForCompany(sheet.getName());
    const fields = buildEventFields(values);
    if (!fields.title || !fields.start) {
      sheet.getRange(row, COLUMNS.STATUS).setValue('Skipped: missing Event or Start Date');
      return;
    }

    let rowId = values[COLUMNS.ID - 1];
    if (!rowId) {
      rowId = Utilities.getUuid();
      createCalendarEvent(calendarId, fields, rowId);
      sheet.getRange(row, COLUMNS.ID).setValue(rowId);
    } else {
      const existing = findEventById(calendarId, rowId);
      if (existing) {
        updateCalendarEvent(calendarId, existing.id, fields, rowId);
      } else {
        createCalendarEvent(calendarId, fields, rowId);
      }
    }
    sheet.getRange(row, COLUMNS.STATUS).setValue('Synced ' + new Date().toLocaleString());
  } catch (err) {
    sheet.getRange(row, COLUMNS.STATUS).setValue('Error: ' + err.message);
  }
}

// ponytail: full-scan reconcile (lists every event on the calendar). Switch to a
// narrower query (e.g. time-bounded) if a company's calendar gets large enough
// for this to be slow.
/** Lists every tagged event on a company's calendar once, returning a rowId -> event map plus any
 * duplicate event ids (more than one event tagged with the same rowId, keeping the first seen).
 * Used both to decide create-vs-update per row and to compute deletions, replacing the separate
 * per-row findEventById lookup and the old standalone reconcileDeletions scan. */
function loadExistingEvents(calendarId) {
  const byRowId = {};
  const duplicateEventIds = [];
  let pageToken;
  do {
    const response = Calendar.Events.list(calendarId, {
      showDeleted: false,
      singleEvents: true,
      maxResults: 2500,
      pageToken: pageToken,
    });
    (response.items || []).forEach(function (event) {
      const props = event.extendedProperties && event.extendedProperties.private;
      const id = props && props[ROW_ID_PROPERTY];
      if (!id) return;
      if (byRowId[id]) {
        duplicateEventIds.push(event.id);
      } else {
        byRowId[id] = event;
      }
    });
    pageToken = response.nextPageToken;
  } while (pageToken);
  return { byRowId: byRowId, duplicateEventIds: duplicateEventIds };
}

/** Builds delete requests for every tagged event whose rowId isn't in sheetIds, plus every
 * duplicate event found by loadExistingEvents. */
function buildDeletionRequests(calendarId, existing, sheetIds) {
  const requests = [];
  Object.keys(existing.byRowId).forEach(function (id) {
    if (!sheetIds[id]) {
      requests.push(buildCalendarRequest(calendarId, 'delete', null, existing.byRowId[id].id));
    }
  });
  existing.duplicateEventIds.forEach(function (eventId) {
    requests.push(buildCalendarRequest(calendarId, 'delete', null, eventId));
  });
  return requests;
}

/** Builds a raw Calendar REST API request (for UrlFetchApp.fetchAll) instead of calling the
 * Calendar.Events.* advanced service, so many rows' worth of writes can be sent concurrently. */
function buildCalendarRequest(calendarId, method, resource, eventId) {
  const base = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events';
  const request = {
    url: eventId ? base + '/' + eventId : base,
    method: method,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  };
  if (resource) {
    request.contentType = 'application/json';
    request.payload = JSON.stringify(resource);
  }
  return request;
}

/** Sends requests through UrlFetchApp.fetchAll in BATCH_SIZE-sized chunks (Apps Script's closest
 * equivalent to concurrent requests), retrying only the responses that come back rate-limited with
 * exponential backoff. Calls onProgress(completedSoFar, total) after each chunk. Returns one
 * {ok, body|error} result per input request, in the same order. */
function runBatched(requests, onProgress) {
  const results = new Array(requests.length);
  for (let start = 0; start < requests.length; start += BATCH_SIZE) {
    const chunk = requests.slice(start, start + BATCH_SIZE);
    const chunkResults = fetchChunkWithRetry(chunk);
    chunkResults.forEach(function (result, i) {
      results[start + i] = result;
    });
    if (onProgress) onProgress(Math.min(start + chunk.length, requests.length), requests.length);
  }
  return results;
}

/** Fires one UrlFetchApp.fetchAll chunk, retrying only the rate-limited responses (with backoff)
 * up to MAX_RETRY_ATTEMPTS; any still rate-limited after that are reported as failed results. */
function fetchChunkWithRetry(requests) {
  let pending = requests.map(function (request, i) { return { index: i, request: request }; });
  const results = new Array(requests.length);
  let attempt = 0;

  while (pending.length && attempt < MAX_RETRY_ATTEMPTS) {
    const responses = UrlFetchApp.fetchAll(pending.map(function (p) { return p.request; }));
    const retryable = [];
    responses.forEach(function (response, i) {
      const entry = pending[i];
      if (isRateLimited(response)) {
        retryable.push(entry);
      } else {
        results[entry.index] = toResult(response);
      }
    });
    pending = retryable;
    if (pending.length) {
      Utilities.sleep(Math.pow(2, attempt) * 500 + Math.floor(Math.random() * 250));
      attempt++;
    }
  }

  pending.forEach(function (entry) {
    results[entry.index] = { ok: false, error: 'Rate-limited after ' + MAX_RETRY_ATTEMPTS + ' attempts' };
  });

  return results;
}

/** True if an HTTP response indicates a rate-limit (429, or 403 with a rate-limit reason) that's
 * worth retrying rather than treating as a hard failure. */
function isRateLimited(response) {
  const code = response.getResponseCode();
  if (code === 429) return true;
  if (code === 403) {
    try {
      const body = JSON.parse(response.getContentText());
      const reason = body.error && body.error.errors && body.error.errors[0] && body.error.errors[0].reason;
      return reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded';
    } catch (err) {
      return false;
    }
  }
  return false;
}

/** Converts a raw HTTPResponse into {ok: true, body} or {ok: false, error}. */
function toResult(response) {
  const code = response.getResponseCode();
  if (code >= 200 && code < 300) {
    let body = {};
    try { body = JSON.parse(response.getContentText()); } catch (err) { /* e.g. empty DELETE body */ }
    return { ok: true, body: body };
  }
  return { ok: false, error: 'HTTP ' + code + ': ' + response.getContentText() };
}

/** Publishes {current, total, message, done} to CacheService so the progress dialog's polling can
 * read it from a separate concurrent execution. Best-effort - never let progress reporting break
 * the resync itself. */
function updateProgress(current, total, message) {
  try {
    CacheService.getScriptCache().put(PROGRESS_CACHE_KEY, JSON.stringify({
      current: current,
      total: total,
      message: message,
      done: current >= total,
    }), 600);
  } catch (err) {
    // Progress reporting is best-effort only.
  }
}

/** Server-side function polled by the progress dialog via google.script.run. */
function getResyncProgress() {
  const raw = CacheService.getScriptCache().get(PROGRESS_CACHE_KEY);
  return raw ? JSON.parse(raw) : { current: 0, total: 1, message: '', done: true };
}

/** Opens a modeless dialog with a live progress bar that polls getResyncProgress once per second,
 * closing itself once the resync reports done. Must be called before the resync runs, from a menu
 * handler. */
function showResyncProgressDialog(total, initialMessage) {
  updateProgress(0, total, initialMessage || 'Starting...');
  const html = HtmlService.createHtmlOutput(
    '<style>' +
    'body{font-family:Arial,sans-serif;padding:12px;}' +
    'progress{width:100%;height:20px;}' +
    '#msg{margin-top:8px;font-size:12px;color:#444;}' +
    '</style>' +
    '<progress id="bar" max="' + total + '" value="0"></progress>' +
    '<div id="msg">' + (initialMessage || 'Starting...') + '</div>' +
    '<script>' +
    'function poll() {' +
    '  google.script.run.withSuccessHandler(function (p) {' +
    '    document.getElementById("bar").max = p.total || 1;' +
    '    document.getElementById("bar").value = p.current;' +
    '    document.getElementById("msg").textContent = p.message + " (" + p.current + "/" + p.total + ")";' +
    '    if (!p.done) { setTimeout(poll, 1000); } else { setTimeout(function () { google.script.host.close(); }, 800); }' +
    '  }).getResyncProgress();' +
    '}' +
    'setTimeout(poll, 500);' +
    '</script>'
  ).setWidth(360).setHeight(120);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Resync Progress');
}

/** Derives the calendar name from a company/sheet name: "40SAR <company> Training Program". */
function calendarNameForSheet(sheetName) {
  return '40SAR ' + sheetName + ' Training Program';
}

/** Resolves a sheet name to its calendar's ID via calendarNameForSheet, erroring on no match or ambiguity. */
function getCalendarForCompany(sheetName) {
  const calendarName = calendarNameForSheet(sheetName);
  const calendars = CalendarApp.getCalendarsByName(calendarName);
  if (calendars.length === 0) throw new Error('No calendar found named "' + calendarName + '"');
  if (calendars.length > 1) throw new Error('Multiple calendars named "' + calendarName + '" - ambiguous');
  return calendars[0].getId();
}

/** Pure: turns one raw sheet row into {title, location, description, start, end, isAllDay}. */
function buildEventFields(values) {
  const startDate = values[COLUMNS.START_DATE - 1];
  const startTime = values[COLUMNS.START_TIME - 1];
  const endDate = values[COLUMNS.END_DATE - 1] || startDate;
  const endTime = values[COLUMNS.END_TIME - 1];
  const instructor = values[COLUMNS.INSTRUCTOR - 1];
  const resources = values[COLUMNS.RESOURCES - 1];
  const comments = values[COLUMNS.COMMENTS - 1];

  const descriptionParts = [];
  if (instructor) descriptionParts.push('Instructor: ' + instructor);
  if (resources) descriptionParts.push('Resources: ' + resources);
  if (comments) descriptionParts.push(comments);

  return {
    title: values[COLUMNS.EVENT - 1],
    location: values[COLUMNS.LOCATION - 1] || '',
    description: descriptionParts.join('\n'),
    start: combineDateTime(startDate, startTime),
    end: combineDateTime(endDate, endTime),
    isAllDay: !startTime,
  };
}

/** Merges a date cell with an optional time cell into one Date; returns null if date is blank. */
function combineDateTime(date, time) {
  if (!date) return null;
  const combined = new Date(date);
  if (time) {
    const t = new Date(time);
    combined.setHours(t.getHours(), t.getMinutes(), t.getSeconds(), 0);
  }
  return combined;
}

/** Builds the Calendar API event resource (handles all-day's exclusive end date) tagged with rowId. */
function buildCalendarResource(fields, rowId) {
  const resource = {
    summary: fields.title,
    location: fields.location,
    description: fields.description,
    extendedProperties: { private: {} },
  };
  resource.extendedProperties.private[ROW_ID_PROPERTY] = rowId;

  if (fields.isAllDay) {
    const endExclusive = new Date(fields.end);
    endExclusive.setDate(endExclusive.getDate() + 1);
    resource.start = { date: formatDate(fields.start) };
    resource.end = { date: formatDate(endExclusive) };
  } else {
    resource.start = { dateTime: fields.start.toISOString() };
    resource.end = { dateTime: fields.end.toISOString() };
  }
  return resource;
}

/** Formats a Date as yyyy-MM-dd in the script's timezone, for all-day event fields. */
function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Inserts a new tagged event on the given calendar. */
function createCalendarEvent(calendarId, fields, rowId) {
  return Calendar.Events.insert(buildCalendarResource(fields, rowId), calendarId);
}

/** Patches an existing event in place, re-applying the rowId tag. */
function updateCalendarEvent(calendarId, eventId, fields, rowId) {
  return Calendar.Events.patch(buildCalendarResource(fields, rowId), calendarId, eventId);
}

/** Looks up the calendar event tagged with the given rowId, or null if none exists. */
function findEventById(calendarId, rowId) {
  const response = Calendar.Events.list(calendarId, {
    privateExtendedProperty: ROW_ID_PROPERTY + '=' + rowId,
    showDeleted: false,
    maxResults: 1,
  });
  const items = response.items || [];
  return items.length ? items[0] : null;
}

/** Installs triggers (idempotent) then runs unit tests and an end-to-end check - scratch-row
 * create/verify plus row-delete reconciliation - reporting everything in one alert. */
function installAndVerifyTriggers() {
  const ui = SpreadsheetApp.getUi();
  const results = [];

  installTriggers();
  const triggers = ScriptApp.getProjectTriggers();
  const hasEditTrigger = triggers.some(function (t) { return t.getHandlerFunction() === 'handleEdit'; });
  results.push((hasEditTrigger ? 'OK' : 'MISSING') + ': onEdit trigger (handleEdit)');

  try {
    runSelfTest();
    results.push('OK: unit tests (buildEventFields, diffRemovedIds)');
  } catch (err) {
    results.push('FAILED unit tests: ' + err.message);
  }

  const sheetName = COMPANIES[0];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    results.push('SKIPPED end-to-end check: no sheet named "' + sheetName + '"');
    logAndAlertVerdict(ui, results);
    return;
  }

  let calendarId;
  try {
    calendarId = getCalendarForCompany(sheetName);
  } catch (err) {
    results.push('FAILED end-to-end check: ' + err.message);
    logAndAlertVerdict(ui, results);
    return;
  }

  const testRow = sheet.getLastRow() + 1;
  const testTitle = 'verifyTrigger test ' + Utilities.getUuid();
  const testDate = new Date();
  testDate.setDate(testDate.getDate() + 1);

  try {
    const values = new Array(COLUMNS.STATUS).fill('');
    values[COLUMNS.EVENT - 1] = testTitle;
    values[COLUMNS.START_DATE - 1] = testDate;
    sheet.getRange(testRow, 1, 1, values.length).setValues([values]);

    upsertEventForRow(sheet, testRow, values);

    const rowId = sheet.getRange(testRow, COLUMNS.ID).getValue();
    const status = sheet.getRange(testRow, COLUMNS.STATUS).getValue();
    if (!rowId) {
      results.push('FAILED end-to-end check: no Id written back (status: ' + status + ')');
    } else {
      const event = findEventById(calendarId, rowId);
      if (event && event.summary === testTitle) {
        results.push('OK: end-to-end check created and found "' + testTitle + '" on Google Calendar');
      } else {
        results.push('FAILED end-to-end check: event not found on Calendar (status: ' + status + ')');
      }
      if (event) Calendar.Events.remove(calendarId, event.id);
    }
  } catch (err) {
    results.push('FAILED end-to-end check: ' + err.message);
  } finally {
    sheet.deleteRow(testRow);
  }

  const deleteTestRow = sheet.getLastRow() + 1;
  const deleteTestTitle = 'verifyTrigger delete test ' + Utilities.getUuid();
  try {
    const values = new Array(COLUMNS.STATUS).fill('');
    values[COLUMNS.EVENT - 1] = deleteTestTitle;
    values[COLUMNS.START_DATE - 1] = testDate;
    sheet.getRange(deleteTestRow, 1, 1, values.length).setValues([values]);

    upsertEventForRow(sheet, deleteTestRow, values);
    const rowId = sheet.getRange(deleteTestRow, COLUMNS.ID).getValue();

    if (!rowId) {
      results.push('SKIPPED row-delete check: scratch row was not synced');
    } else {
      // Simulate the snapshot handleEdit would have taken right after assigning this rowId,
      // so reconcileRemovedRowIds below has a baseline that includes the new row.
      setKnownRowIds(sheetName, getCurrentRowIds(sheet));
      sheet.deleteRow(deleteTestRow);
      reconcileRemovedRowIds(sheet);
      const event = findEventById(calendarId, rowId);
      results.push(event
        ? 'FAILED row-delete check: event still present after row delete + reconcileRemovedRowIds'
        : 'OK: row-delete check removed the calendar event after deleting the sheet row');
    }
  } catch (err) {
    results.push('FAILED row-delete check: ' + err.message);
  }

  logAndAlertVerdict(ui, results);
}

function logAndAlertVerdict(ui, results) {
  const failures = results.filter(function (r) {
    return r.indexOf('FAILED') === 0 || r.indexOf('MISSING') === 0;
  });
  results.push('');
  results.push('Verdict: ' + (failures.length ? 'Error: ' + failures.join('; ') : 'Successful'));
  Logger.log(results.join('\n'));
  ui.alert(results.join('\n'));
}

// ponytail-required self-check: exercises buildEventFields and diffRemovedIds only, no Calendar calls.
// Run manually from the Apps Script editor.
function runSelfTest() {
  const assertEqual = function (actual, expected, message) {
    if (actual !== expected) {
      throw new Error('FAIL: ' + message + ' — expected ' + expected + ', got ' + actual);
    }
  };

  const allDayFields = buildEventFields(buildTestRow({
    event: 'Orientation',
    instructor: 'Jane',
    location: 'Room 1',
    startDate: new Date(2026, 0, 10),
    startTime: '',
    endDate: new Date(2026, 0, 10),
    endTime: '',
    resources: 'Projector',
    comments: 'Bring laptop',
  }));
  assertEqual(allDayFields.isAllDay, true, 'all-day flag');
  assertEqual(allDayFields.location, 'Room 1', 'all-day location');
  assertEqual(
    allDayFields.description,
    'Instructor: Jane\nResources: Projector\nBring laptop',
    'all-day description'
  );

  const timedFields = buildEventFields(buildTestRow({
    event: 'Workshop',
    instructor: 'John',
    location: 'Room 2',
    startDate: new Date(2026, 0, 11),
    startTime: new Date(1899, 11, 30, 9, 0),
    endDate: new Date(2026, 0, 11),
    endTime: new Date(1899, 11, 30, 17, 0),
    resources: '',
    comments: '',
  }));
  assertEqual(timedFields.isAllDay, false, 'timed flag');
  assertEqual(timedFields.start.getHours(), 9, 'timed start hour');
  assertEqual(timedFields.end.getHours(), 17, 'timed end hour');
  assertEqual(timedFields.description, 'Instructor: John', 'timed description');

  assertEqual(diffRemovedIds(['a', 'b'], ['a', 'b']).length, 0, 'no removals');
  assertEqual(diffRemovedIds(['a', 'b'], ['a']).join(','), 'b', 'one removal');
  assertEqual(diffRemovedIds(['a', 'b'], []).join(','), 'a,b', 'all removed');
  assertEqual(diffRemovedIds([], ['a']).length, 0, 'no previous ids');

  Logger.log('runSelfTest: all assertions passed');
}

/** Assembles a fake row array (matching COLUMNS layout) from named fields, for runSelfTest. */
function buildTestRow(fields) {
  const row = new Array(COLUMNS.STATUS).fill('');
  row[COLUMNS.EVENT - 1] = fields.event;
  row[COLUMNS.INSTRUCTOR - 1] = fields.instructor;
  row[COLUMNS.LOCATION - 1] = fields.location;
  row[COLUMNS.START_DATE - 1] = fields.startDate;
  row[COLUMNS.START_TIME - 1] = fields.startTime;
  row[COLUMNS.END_DATE - 1] = fields.endDate;
  row[COLUMNS.END_TIME - 1] = fields.endTime;
  row[COLUMNS.RESOURCES - 1] = fields.resources;
  row[COLUMNS.COMMENTS - 1] = fields.comments;
  return row;
}
