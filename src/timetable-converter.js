import { convertTimetableToIcs, downloadIcs } from './lib/timetable-to-ics.js'

const input = document.querySelector('#timetable')
const button = document.querySelector('#download')
const status = document.querySelector('#status')
let result
let filename
let selectionVersion = 0

input.addEventListener('change', async () => {
  const version = ++selectionVersion
  result = undefined
  button.disabled = true
  const file = input.files[0]
  if (!file) {
    status.textContent = '请选择文件。'
    return
  }
  status.textContent = '正在转换…'
  try {
    const converted = convertTimetableToIcs(await file.text())
    if (version !== selectionVersion) return
    result = converted
    filename = file.name.replace(/\.[^.]+$/, '') + '.ics'
    status.textContent = `已转换 ${result.recordCount} 条排课记录，生成 ${result.eventCount} 个上课事件。`
      + (result.duplicateEventCount ? `\n已合并 ${result.duplicateEventCount} 个完全重复的事件。` : '')
    button.disabled = false
  } catch (error) {
    if (version === selectionVersion) status.textContent = `转换失败：${error.message}`
  }
})

button.addEventListener('click', () => {
  if (result) downloadIcs(result.ics, filename)
})
