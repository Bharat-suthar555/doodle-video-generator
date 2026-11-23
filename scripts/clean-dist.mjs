#!/usr/bin/env node
// Removes dist/ so a build never ships files from deleted sources.
import { rmSync } from 'node:fs'
import path from 'node:path'

rmSync(path.resolve(import.meta.dirname, '..', 'dist'), { recursive: true, force: true })
