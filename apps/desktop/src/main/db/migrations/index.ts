import type { Migration } from '../migrate'
import { m001Init } from './001_init'
import { m002TodoNote } from './002_todo_note'

export const migrations: readonly Migration[] = [m001Init, m002TodoNote]
