// The event in the calendar of a task with a due date (pim/taskEvents.ts): on the due day (or an
// hour from its due time, in its time zone, never floating), without reminders, linked both ways,
// with "✓ " in its title while the task is done, and only what changed in the task changes it.
process.env.TZ = "Europe/Berlin";
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");

const { EventType, TaskType, TaskStatusType } = require("../src/pim/pim-types");
const { applyTaskToEvent, linkedEventUid, linkedTaskUid, newTaskEvent, setLinkedEvent } = require("../src/pim/taskEvents");

const ics = (...lines) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test", ...lines.flat(), "END:VCALENDAR", ""].join("\r\n");
const taskOf = (...lines) => TaskType.parse(ics("BEGIN:VTODO", "UID:task-1", "SUMMARY:Pay rent", ...lines, "END:VTODO"));
// The event as it's saved, read again
const saved = (event) => EventType.parse(event.toIcal());
const line = (event, name) => event.toIcal().split("\r\n").find((x) => x.startsWith(name));

test("a task due on a day gets an all day event on that day, linked both ways and without reminders", () => {
  const task = taskOf("DUE;VALUE=DATE:20261030", "DESCRIPTION:To the landlord",
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Pay rent", "TRIGGER;RELATED=END:PT9H", "END:VALARM");
  const event = saved(newTaskEvent(task));
  setLinkedEvent(task, event.uid);

  assert.equal(event.summary, "Pay rent");
  assert.equal(event.description, "To the landlord");
  assert.equal(line(event, "DTSTART"), "DTSTART;VALUE=DATE:20261030");
  assert.equal(line(event, "DTEND"), "DTEND;VALUE=DATE:20261031");
  assert.equal(event.component.getAllSubcomponents("valarm").length, 0);
  assert.equal(linkedTaskUid(event), "task-1");
  assert.equal(linkedEventUid(TaskType.parse(task.toIcal())), event.uid);
  assert.match(event.toIcal(), /\r\nX-CIPHWREN-TASK:task-1\r\n/);
  assert.match(task.toIcal(), /\r\nX-CIPHWREN-EVENT:[0-9a-f-]{36}\r\n/);
  for (const name of ["DTSTAMP", "CREATED", "LAST-MODIFIED"]) {
    assert.match(line(event, name), /^[A-Z-]+:\d{8}T\d{6}Z$/, name);
  }

  setLinkedEvent(task, undefined);
  assert.equal(linkedEventUid(task), undefined);
  assert.doesNotMatch(task.toIcal(), /X-CIPHWREN|X-ETESYNC/);
});

test("a due time gives an hour from then in its time zone, and a floating one is taken as on this device", () => {
  const zoned = saved(newTaskEvent(taskOf("DUE;TZID=America/New_York:20261030T170000")));
  assert.equal(line(zoned, "DTSTART"), "DTSTART;TZID=America/New_York:20261030T170000");
  assert.equal(line(zoned, "DTEND"), "DTEND;TZID=America/New_York:20261030T180000");
  assert.match(zoned.toIcal(), /BEGIN:VTIMEZONE\r\nTZID:America\/New_York/);

  const utc = saved(newTaskEvent(taskOf("DUE:20261030T170000Z")));
  assert.equal(line(utc, "DTSTART"), "DTSTART:20261030T170000Z");
  assert.equal(line(utc, "DTEND"), "DTEND:20261030T180000Z");

  const floating = saved(newTaskEvent(taskOf("DUE:20261030T170000")));
  assert.equal(line(floating, "DTSTART"), "DTSTART;TZID=Europe/Berlin:20261030T170000");
  assert.equal(floating.startDate.toJSDate().toISOString(), "2026-10-30T16:00:00.000Z");
});

test("the title says when the task is done, and goes back when it isn't", () => {
  const task = taskOf("DUE;VALUE=DATE:20261030");
  const event = newTaskEvent(task);
  const done = task.clone();
  done.status = TaskStatusType.Completed;
  assert.equal(applyTaskToEvent(event, done, task), true);
  assert.equal(event.summary, "✓ Pay rent");
  assert.equal(applyTaskToEvent(event, done, done), false);
  assert.equal(applyTaskToEvent(event, task, done), true);
  assert.equal(event.summary, "Pay rent");
});

test("only what changed in the task changes the event, so one moved in the calendar stays", () => {
  const task = taskOf("DUE;VALUE=DATE:20261030");
  const event = saved(newTaskEvent(task));
  // Moved to another day in the calendar
  const moved = event.startDate.clone();
  moved.day = 31;
  event.startDate = moved;

  const renamed = task.clone();
  renamed.title = "Pay the rent";
  assert.equal(applyTaskToEvent(event, renamed, task), true);
  assert.equal(event.summary, "Pay the rent");
  assert.equal(line(event, "DTSTART"), "DTSTART;VALUE=DATE:20261031");

  const later = renamed.clone();
  const due = later.dueDate.clone();
  due.month = 11;
  due.day = 2;
  later.dueDate = due;
  assert.equal(applyTaskToEvent(event, later, renamed), true);
  assert.equal(line(event, "DTSTART"), "DTSTART;VALUE=DATE:20261102");
  assert.equal(line(event, "DTEND"), "DTEND;VALUE=DATE:20261103");

  // Notes removed from the task are removed from the event
  const noted = later.clone();
  noted.description = "Bank transfer";
  applyTaskToEvent(event, noted, later);
  assert.equal(event.description, "Bank transfer");
  applyTaskToEvent(event, later, noted);
  assert.equal(event.component.getFirstProperty("description"), null);
});

test("links made before the app was renamed are read, and replaced when the items are saved", () => {
  const task = taskOf("DUE;VALUE=DATE:20261030", "X-ETESYNC-DESKTOP-EVENT:event-1");
  const event = EventType.parse(ics("BEGIN:VEVENT", "UID:event-1", "SUMMARY:Pay rent", "DTSTART;VALUE=DATE:20261030",
    "DTEND;VALUE=DATE:20261031", "X-ETESYNC-DESKTOP-TASK:task-1", "END:VEVENT"));
  assert.equal(linkedEventUid(task), "event-1");
  assert.equal(linkedTaskUid(event), "task-1");

  setLinkedEvent(task, linkedEventUid(task));
  assert.equal(applyTaskToEvent(event, task, task), true);
  assert.match(task.toIcal(), /\r\nX-CIPHWREN-EVENT:event-1\r\n/);
  assert.match(event.toIcal(), /\r\nX-CIPHWREN-TASK:task-1\r\n/);
  assert.doesNotMatch(task.toIcal() + event.toIcal(), /X-ETESYNC/);
  assert.equal(linkedTaskUid(saved(event)), "task-1");
});
