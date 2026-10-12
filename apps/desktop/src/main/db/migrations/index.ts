import type { Migration } from '../migrate'
import { m001Init } from './001_init'
import { m002TodoNote } from './002_todo_note'
import { m003Pomodoro } from './003_pomodoro'

export const migrations: readonly Migration[] = [m001Init, m002TodoNote, m003Pomodoro]
