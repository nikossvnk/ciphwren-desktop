// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The fields of an event, a task, a contact or a bookmark, as the history shows them: each version is
// shown as these, and the fields of two versions are compared with each other. A field is a line of
// text (e.g. the title), or a list (e.g. the phone numbers), whose entries are compared one by one.

import type { ItemMetadata } from "etebase";

import type { BookmarkMetadata } from "../bookmarks";
import { ContactType, EventType, TaskStatusType, TaskType } from "./pim-types";
import { contactBirthday, eventAttendees } from "./occurrences";
import { priorityLabels, priorityOf, repeatName } from "./tasks";
import { reminderLabel, remindersOf } from "./reminders";
import { DateFormats } from "./format";

export interface Field {
  label: string;
  value?: string;
  list?: string[];
}

// A day, e.g. "Thu 22 Oct 2026"
function dayOf(date: Date, fmt: DateFormats) {
  return `${fmt.weekDay.format(date)} ${fmt.mediumDate(date)}`;
}

// When an event is, e.g. "Thu 22 Oct 2026, 12:30 – 13:30", with its time zone when it isn't the one
// here
function eventWhen(event: EventType, fmt: DateFormats) {
  const start = event.startDate.toJSDate();
  const allDay = event.startDate.isDate;
  let end = event.endDate?.toJSDate() ?? start;
  if (allDay) {
    // (all day events end at the start of the day after their last one)
    end = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  }
  const sameDay = start.toDateString() === end.toDateString();
  const value = (allDay) ? ((sameDay) ? `${dayOf(start, fmt)}, all day` : `${dayOf(start, fmt)} – ${dayOf(end, fmt)}, all day`) :
    (sameDay) ? `${dayOf(start, fmt)}, ${fmt.time(start)} – ${fmt.time(end)}` : `${dayOf(start, fmt)}, ${fmt.time(start)} – ${dayOf(end, fmt)}, ${fmt.time(end)}`;
  const zone = (!allDay) ? (event.startDate.timezone ?? event.startDate.zone?.tzid) : undefined;
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (zone && (zone !== "floating") && (zone !== here)) ? `${value} (${zone.replace(/_/g, " ")} time shown where you are)` : value;
}

// A date of a task (its due date, or when it starts): the day, and the time unless it's for the whole day
function taskDate(time: { toJSDate(): Date, isDate: boolean }, fmt: DateFormats) {
  const date = time.toJSDate();
  return (time.isDate) ? dayOf(date, fmt) : `${dayOf(date, fmt)}, ${fmt.time(date)}`;
}

export function eventFields(content: string, fmt: DateFormats): Field[] | undefined {
  let event: EventType;
  try {
    event = EventType.parse(content);
  } catch (e) {
    return undefined;
  }
  const ret: Field[] = [{ label: "Title", value: event.summary || "(no title)" }];
  try {
    ret.push({ label: "When", value: eventWhen(event, fmt) });
  } catch (e) {
    ret.push({ label: "When", value: "(can't be read)" });
  }
  if (event.isRecurring()) {
    const changed = event.changedTimes.length;
    ret.push({ label: "Repeats", value: repeatName(event.rrule) + ((changed) ? ` (${changed} ${(changed === 1) ? "time" : "times"} changed on its own)` : "") });
  }
  if (event.location) {
    ret.push({ label: "Location", value: event.location });
  }
  const attendees = eventAttendees(event).map((x) => x.name);
  if (attendees.length > 0) {
    ret.push({ label: "Attendees", list: attendees });
  }
  if (event.description) {
    ret.push({ label: "Description", value: event.description });
  }
  return ret;
}

const statusNames: { [status: string]: string } = {
  [TaskStatusType.NeedsAction]: "Not done",
  [TaskStatusType.InProcess]: "In progress",
  [TaskStatusType.Completed]: "Done",
  [TaskStatusType.Cancelled]: "Cancelled",
};

export function taskFields(content: string, fmt: DateFormats): Field[] | undefined {
  let task: TaskType;
  try {
    task = TaskType.parse(content);
  } catch (e) {
    return undefined;
  }
  const ret: Field[] = [{ label: "Title", value: task.summary || "(no title)" }];
  let status = statusNames[task.status] ?? "Not done";
  try {
    if ((task.status === TaskStatusType.Completed) && task.completionDate) {
      status += `, ${taskDate(task.completionDate, fmt)}`;
    }
  } catch (e) {
    // (a date that can't be read is left out)
  }
  ret.push({ label: "Status", value: status });
  const priority = priorityOf(task);
  if (priority !== "none") {
    ret.push({ label: "Priority", value: priorityLabels[priority] });
  }
  const date = (label: string, read: () => { toJSDate(): Date, isDate: boolean } | undefined | null) => {
    try {
      const time = read();
      if (time) {
        ret.push({ label, value: taskDate(time, fmt) });
      }
    } catch (e) {
      ret.push({ label, value: "(can't be read)" });
    }
  };
  date("Starts", () => task.startDate);
  date("Due", () => task.dueDate);
  if (task.isRecurring()) {
    ret.push({ label: "Repeats", value: repeatName(task.rrule) });
  }
  try {
    const reminders = remindersOf(task.component);
    if (reminders.length > 0) {
      ret.push({ label: "Reminders", list: reminders.map((x) => reminderLabel(x, task.allDay, true, fmt)) });
    }
  } catch (e) {
    // (reminders that can't be read are left out)
  }
  if (task.tags.length > 0) {
    ret.push({ label: "Tags", list: task.tags });
  }
  if (task.description) {
    ret.push({ label: "Description", value: task.description });
  }
  return ret;
}

// The values of a property of a contact (e.g. each of their phone numbers), with their types after
// them, e.g. "+49 30 5550 1377 · mobile"
function contactValues(contact: ContactType, name: string) {
  return contact.comp.getAllProperties(name).map((prop) => {
    let value = prop.getFirstValue();
    if (Array.isArray(value)) {
      // (e.g. addresses: post office box, extended, street, city, region, code, country)
      value = value.filter((x) => x).join(", ");
    } else if (value && (typeof value === "object")) {
      value = value.toString();
    }
    const text = String(value ?? "").replace(/^tel:/, "").trim();
    let type = prop.getParameter("type");
    type = (Array.isArray(type)) ? type.join(", ") : type;
    return (text && type) ? `${text} · ${String(type).toLowerCase()}` : text;
  }).filter((x) => x);
}

export function contactFields(content: string, fmt: DateFormats): Field[] | undefined {
  let contact: ContactType;
  try {
    contact = ContactType.parse(content);
  } catch (e) {
    return undefined;
  }
  const ret: Field[] = [{ label: "Name", value: String(contact.fn ?? "").trim() || "(no name)" }];
  const one = (label: string, property: string) => {
    const values = contactValues(contact, property);
    if (values.length > 0) {
      ret.push({ label, value: values.join("; ") });
    }
  };
  const list = (label: string, property: string) => {
    const values = contactValues(contact, property);
    if (values.length > 0) {
      ret.push({ label, list: values });
    }
  };
  list("Phone", "tel");
  list("Email", "email");
  one("Organisation", "org");
  one("Job title", "title");
  const bday = contactBirthday(contact);
  if (bday) {
    ret.push({ label: "Birthday", value: fmt.dayMonth.format(new Date(bday.year ?? 2000, bday.month, bday.day)) + ((bday.year) ? ` ${bday.year}` : "") });
  }
  list("Address", "adr");
  list("Website", "url");
  one("Note", "note");
  return ret;
}

// A bookmark's fields are in its meta (its content is only its link)
export function bookmarkFields(meta: ItemMetadata): Field[] {
  const bookmark = meta as Partial<BookmarkMetadata>;
  const ret: Field[] = [
    { label: "Title", value: bookmark.name || "(no title)" },
    { label: "Link", value: bookmark.url ?? "" },
  ];
  if (bookmark.description) {
    ret.push({ label: "Note", value: bookmark.description });
  }
  if (bookmark.tags && (bookmark.tags.length > 0)) {
    ret.push({ label: "Tags", list: bookmark.tags });
  }
  return ret;
}
