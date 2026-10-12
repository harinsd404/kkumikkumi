import type { Migration } from '../migrate'
import { m001Init } from './001_init'

export const migrations: readonly Migration[] = [m001Init]
