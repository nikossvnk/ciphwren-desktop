// SPDX-FileCopyrightText: © 2026 EteSync Desktop Authors
// SPDX-License-Identifier: GPL-3.0-only

// An event in the calendar for a task with a due date, on its due day. The two are linked both ways
// in the synced data, so every device keeps them together: the task has X-ETESYNC-DESKTOP-EVENT with
// the event's UID, and the event X-ETESYNC-DESKTOP-TASK with the task's (RELATED-TO isn't used, apps
// read it as a task's parent). The event follows the task: its title (with "✓ " when the task is
// done), its notes and its due date. Without a due date, or when the task is deleted, the event is
// deleted too. Changing the event doesn't change the task.

import * as Etebase from "etebase";
import * as ICAL from "ical.js";
import * as uuid from "uuid";

import { store } from "../store";
import { findCollection } from "../cached";
import * as C from "../constants";
import { EventType, TaskType, timezoneLoadFromName, utcNow } from "./pim-types";
import { deletePimItems, entriesOfType, loadPimItems, savePimItem } from "./data";
import { addSeconds, bumpSequence } from "./recurrence";

const eventProperty = "x-etesync-desktop-event";
const taskProperty = "x-etesync-desktop-task";

// The UID of the event of a task, if it has one
export function linkedEventUid(task: TaskType): string | undefined {
  return task.component.getFirstPropertyValue<string>(eventProperty) || undefined;
}

export function setLinkedEvent(task: TaskType, eventUid: string | undefined) {
  if (eventUid) {
    task.component.updatePropertyWithValue(eventProperty, eventUid);
  } else {
    task.component.removeAllProperties(eventProperty);
  }
}

// The UID of the task an event is for, if it's one
export function linkedTaskUid(event: EventType): string | undefined {
  return event.component.getFirstPropertyValue<string>(taskProperty) || undefined;
}

// The event's title: the task's, with a mark when it's done
export function taskEventTitle(task: TaskType) {
  return (task.finished) ? `✓ ${task.title ?? ""}` : (task.title ?? "");
}

// The times of the event of a task: its due day (all day), or an hour from its due time, in the due
// date's time zone (one this device doesn't have loaded yet is loaded by its name; a due time without
// one, as other apps can save it, is taken as on this device: events are never saved with floating
// times)
export function taskEventTimes(due: ICAL.Time): { start: ICAL.Time, end: ICAL.Time } {
  if (due.isDate) {
    const end = due.clone();
    end.adjust(1, 0, 0, 0);
    return { start: due.clone(), end };
  }
  let start = due.clone();
  if (!start.zone || (start.zone === ICAL.Timezone.localTimezone)) {
    const named = (due.timezone && (due.timezone !== "floating")) ? due.timezone : undefined;
    const zone = timezoneLoadFromName(named ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    const data = { year: due.year, month: due.month, day: due.day, hour: due.hour, minute: due.minute, second: due.second, isDate: false };
    start = (zone) ? ICAL.Time.fromData(data, zone) : ICAL.Time.fromJSDate(new Date(due.year, due.month - 1, due.day, due.hour, due.minute, due.second), true);
  }
  return { start, end: addSeconds(start, 3600) };
}

// What the event shows of the task, as text, to tell whether it changed
function shown(event: EventType) {
  return ["summary", "description", "dtstart", "dtend", taskProperty].map((x) => event.component.getFirstProperty(x)?.toICALString() ?? "").join("\n");
}

// Sets what the event shows of the task. With the task as it was before (`before`), only what
// changed in the task since is set, so an event that was changed in the calendar (e.g. moved to
// another time) keeps that until the task's due date changes. True when the event changed.
export function applyTaskToEvent(event: EventType, task: TaskType, before?: TaskType): boolean {
  const old = shown(event);
  if (!before || (taskEventTitle(before) !== taskEventTitle(task))) {
    event.summary = taskEventTitle(task);
  }
  if (!before || ((before.description ?? "") !== (task.description ?? ""))) {
    if (task.description) {
      event.description = task.description;
    } else {
      event.component.removeAllProperties("description");
    }
  }
  if (task.dueDate && (!before || !before.dueDate || (before.dueDate.toString() !== task.dueDate.toString()) || (before.dueDate.zone?.tzid !== task.dueDate.zone?.tzid))) {
    const { start, end } = taskEventTimes(task.dueDate);
    event.startDate = start;
    event.endDate = end;
  }
  event.component.updatePropertyWithValue(taskProperty, task.uid);
  return shown(event) !== old;
}

// A new event for a task (no reminders: the task's own already notify)
export function newTaskEvent(task: TaskType): EventType {
  const event = new EventType();
  event.uid = uuid.v4();
  const now = utcNow();
  event.component.updatePropertyWithValue("dtstamp", now);
  event.component.updatePropertyWithValue("created", now);
  event.component.updatePropertyWithValue("last-modified", now);
  event.component.updatePropertyWithValue("sequence", 0);
  applyTaskToEvent(event, task);
  return event;
}

// Whether the calendar can be changed (it's there, and not shared read only with this account)
export function writableCalendar(etebase: Etebase.Account, colUid: string) {
  const loaded = findCollection(etebase, colUid);
  return !!loaded && (loaded.col.accessLevel !== Etebase.CollectionAccessLevel.ReadOnly);
}

// The (changeable) event of a task, if it has one that's there
async function eventOf(etebase: Etebase.Account, task: TaskType) {
  const uid = linkedEventUid(task);
  if (!uid) {
    return undefined;
  }
  const events = await loadPimItems(etebase, entriesOfType(store.getState(), C.calendarType), EventType.parse);
  const event = events.find((x) => x.uid === uid);
  return (event && writableCalendar(etebase, event.collectionUid!)) ? event : undefined;
}

// Brings the event of a task up to date, before the task is saved (`before` is the task as it
// was, see applyTaskToEvent). `calendar` is the calendar the event is wanted in: undefined keeps the
// one it has (and makes none), null removes it. A task without a due date has none. When the event
// is gone (deleted elsewhere) or can't be changed, the link is dropped. The task's link is set to
// what's left; the calendar of its event is returned.
export async function updateTaskEvent(etebase: Etebase.Account, task: TaskType, before?: TaskType, calendar?: string | null): Promise<string | undefined> {
  if (!linkedEventUid(task) && !calendar) {
    return undefined;
  }
  const existing = await eventOf(etebase, task);
  const wanted = (calendar === undefined) ? existing?.collectionUid : calendar;
  if (!wanted || !task.dueDate) {
    if (existing) {
      await deletePimItems(etebase, [existing]);
    }
    setLinkedEvent(task, undefined);
    return undefined;
  }
  let event: EventType;
  if (existing) {
    event = existing.clone();
    const changed = applyTaskToEvent(event, task, before);
    if (changed) {
      bumpSequence(event.component);
      event.component.updatePropertyWithValue("last-modified", utcNow());
    }
    if (changed || (wanted !== existing.collectionUid)) {
      await savePimItem(etebase, wanted, event);
    }
  } else {
    event = newTaskEvent(task);
    await savePimItem(etebase, wanted, event);
  }
  setLinkedEvent(task, event.uid);
  return wanted;
}

// Deletes the events of tasks that are deleted
export async function deleteTaskEvents(etebase: Etebase.Account, tasks: TaskType[]) {
  if (!tasks.some((x) => linkedEventUid(x))) {
    return;
  }
  const events = (await Promise.all(tasks.map((x) => eventOf(etebase, x)))).filter((x) => x !== undefined);
  if (events.length > 0) {
    await deletePimItems(etebase, events);
  }
}

// The next time of a repeating task that was done gets an event of its own, in the calendar of the
// done one's (it has the done one's link, as it's a copy of it)
export async function nextTaskEvent(etebase: Etebase.Account, next: TaskType, calendar: string | undefined) {
  setLinkedEvent(next, undefined);
  if (calendar) {
    await updateTaskEvent(etebase, next, undefined, calendar);
  }
}
