import { copyFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
await rename(new URL('.local/iphone-test/iphone-test.html', root), new URL('.local/iphone-test/index.html', root))
// This file was converted in the browser. The test host only serves static bytes.
await copyFile(
  new URL('.local/timetable/2026-10-08/my-timetable-semester-84.ics', root),
  new URL('.local/iphone-test/calendar.ics', root),
)
console.log(`Fixed iPhone test site prepared: ${fileURLToPath(new URL('.local/iphone-test/', root))}`)
