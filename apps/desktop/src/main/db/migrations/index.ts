import type { Migration } from '../migrate'
import { m001Init } from './001_init'
import { m002TodoNote } from './002_todo_note'
import { m003Pomodoro } from './003_pomodoro'
import { m004Memos } from './004_memos'
import { m005Timetable } from './005_timetable'
import { m006Timetables } from './006_timetables'
import { m007Sprints } from './007_sprints'
import { m008Diary } from './008_diary'

export const migrations: readonly Migration[] = [
  m001Init,
  m002TodoNote,
  m003Pomodoro,
  m004Memos,
  m005Timetable,
  m006Timetables,
  m007Sprints,
  m008Diary,
]
