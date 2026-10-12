'use strict'
// 최소 API만 노출(ipcRenderer 자체는 노출하지 않는다). 수신 채널은 허용 목록만.
const { contextBridge, ipcRenderer } = require('electron')

const IN = ['images', 'state', 'dir', 'cfg', 'hud']
contextBridge.exposeInMainWorld('pet', {
  on: (ch, cb) => {
    if (IN.includes(ch)) ipcRenderer.on(ch, (_e, v) => cb(v))
  },
  hover: (over) => ipcRenderer.send('hover', Boolean(over)),
  drag: (d) =>
    ipcRenderer.send('drag', {
      phase: String(d.phase),
      screenX: Number(d.screenX),
      screenY: Number(d.screenY),
      offsetX: Number(d.offsetX),
      offsetY: Number(d.offsetY),
    }),
  stats: (s) => ipcRenderer.send('stats', s),
})
