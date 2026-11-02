// The fields that the history shows for each version of a task, a contact and a bookmark (and that
// two versions are compared by): what each has, in order, and that one that can't be read gives none.
process.env.TZ = "UTC";
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");

const { bookmarkFields, contactFields, taskFields } = require("../src/pim/historyFields");
const { dateFormats } = require("../src/pim/format");

const fmt = dateFormats("en-gb");
const calendar = (...lines) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test", ...lines, "END:VCALENDAR", ""].join("\r\n");
const byLabel = (fields) => Object.fromEntries(fields.map((x) => [x.label, x.list ?? x.value]));

test("a task's fields", () => {
  const fields = taskFields(calendar(
    "BEGIN:VTODO", "UID:t1", "SUMMARY:Send the invoice", "STATUS:COMPLETED", "COMPLETED:20261020T091400Z",
    "PRIORITY:1", "DUE;VALUE=DATE:20261022", "RRULE:FREQ=WEEKLY;INTERVAL=2", "CATEGORIES:work,money",
    "DESCRIPTION:To Studio K", "END:VTODO",
  ), fmt);
  assert.deepEqual(fields.map((x) => x.label), ["Title", "Status", "Priority", "Due", "Repeats", "Tags", "Description"]);
  assert.deepEqual(byLabel(fields), {
    Title: "Send the invoice",
    Status: "Done, Tue 20 Oct 2026, 09:14",
    Priority: "High",
    Due: "Thu 22 Oct 2026",
    Repeats: "Every 2 weeks",
    Tags: ["work", "money"],
    Description: "To Studio K",
  });
});

test("a task with only a title isn't done, and has no priority or dates", () => {
  assert.deepEqual(taskFields(calendar("BEGIN:VTODO", "UID:t2", "SUMMARY:Call back", "END:VTODO"), fmt),
    [{ label: "Title", value: "Call back" }, { label: "Status", value: "Not done" }]);
});

test("a contact's fields, with the types of their phone numbers", () => {
  const fields = contactFields([
    "BEGIN:VCARD", "VERSION:4.0", "UID:c1", "FN:Maya Kowalski", "TEL;TYPE=CELL:+49 30 5550 1377",
    "EMAIL:maya@studio-k.example", "EMAIL;TYPE=work:maya.kowalski@work.example", "ORG:Studio K", "TITLE:Design lead",
    "BDAY:--1021", "NOTE:Met at the fair", "END:VCARD", "",
  ].join("\r\n"), fmt);
  assert.deepEqual(byLabel(fields), {
    "Name": "Maya Kowalski",
    "Phone": ["+49 30 5550 1377 · cell"],
    "Email": ["maya@studio-k.example", "maya.kowalski@work.example · work"],
    "Organisation": "Studio K",
    "Job title": "Design lead",
    "Birthday": "21 October",
    "Note": "Met at the fair",
  });
});

test("a bookmark's fields are in its meta", () => {
  assert.deepEqual(bookmarkFields({ name: "Etebase", url: "https://www.etebase.com/", mtime: 1, description: "The server", tags: ["sync"] }), [
    { label: "Title", value: "Etebase" },
    { label: "Link", value: "https://www.etebase.com/" },
    { label: "Note", value: "The server" },
    { label: "Tags", list: ["sync"] },
  ]);
  assert.deepEqual(bookmarkFields({ url: "https://example.com/" }).map((x) => x.label), ["Title", "Link"]);
});

test("a version that can't be read has no fields", () => {
  assert.equal(taskFields("not a calendar", fmt), undefined);
  assert.equal(contactFields("not a card", fmt), undefined);
});
