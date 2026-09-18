const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

const SUPABASE_URL = 'https://qpfmwgzajcnfmhsaqyjr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ByNDk5bbJHsjC9pErRdHZg_BJG48-14';
const CHANNEL_NAME = 'sbky-lockdown-school-2026';
const ADMIN_PIN = '2468'; // pilot PIN only; replace with authenticated admin before operational use

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow;
let alertWindow;
let tray;
let currentAlert = false;
let roomName = 'Classroom';

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900, height: 720, minWidth: 760, minHeight: 620,
    title: 'SBKY Lockdown Alert',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile('index.html');
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('SBKY Lockdown Alert');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open SBKY Lockdown Alert', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

function sendStatus(status, detail='') {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('connection-status', { status, detail });
}

function openAlert(payload = {}) {
  currentAlert = true;
  if (alertWindow && !alertWindow.isDestroyed()) {
    alertWindow.show(); alertWindow.focus(); alertWindow.setAlwaysOnTop(true, 'screen-saver'); alertWindow.setFullScreen(true);
    alertWindow.webContents.send('lockdown-data', { ...payload, roomName }); return;
  }
  alertWindow = new BrowserWindow({
    show: false, fullscreen: true, kiosk: true, alwaysOnTop: true, skipTaskbar: false, frame: false,
    backgroundColor: '#d30d1b',
    webPreferences: { preload: path.join(__dirname, 'alert-preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  alertWindow.setAlwaysOnTop(true, 'screen-saver');
  alertWindow.loadFile('alert.html');
  alertWindow.once('ready-to-show', () => {
    alertWindow.show(); alertWindow.focus(); alertWindow.setAlwaysOnTop(true, 'screen-saver'); alertWindow.setFullScreen(true);
    alertWindow.webContents.send('lockdown-data', { ...payload, roomName });
  });
  alertWindow.on('close', (e) => { if (currentAlert && !app.isQuitting) e.preventDefault(); });
}

function closeAlert() {
  currentAlert = false;
  if (alertWindow && !alertWindow.isDestroyed()) {
    alertWindow.webContents.send('all-clear');
    setTimeout(() => {
      if (alertWindow && !alertWindow.isDestroyed()) alertWindow.destroy();
      alertWindow = null;
    }, 250);
  }
}

let socket;
let socketRef = 1;
let heartbeatTimer;
let channelJoinRef = null;
const pendingBroadcasts = new Map();

function realtimeWsUrl(){
  const u = new URL(SUPABASE_URL);
  return `wss://${u.host}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE_KEY)}&vsn=1.0.0`;
}

function wsSend(topic, event, payload, ref=null, joinRef=channelJoinRef){
  if(!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Realtime connection is not ready');
  socket.send(JSON.stringify({topic,event,payload,ref,join_ref: joinRef}));
}

async function connectRealtime() {
  try {
    socket = new WebSocket(realtimeWsUrl());
    socket.onopen = () => {
      const ref = String(socketRef++);
      channelJoinRef = ref;
      wsSend(`realtime:${CHANNEL_NAME}`, 'phx_join',
        {config:{broadcast:{self:false,ack:true},presence:{enabled:false},postgres_changes:[],private:false}}, ref, ref);
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        try { wsSend('phoenix','heartbeat',{},String(socketRef++),null); } catch {}
      }, 25000);
    };
    socket.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if(msg.event === 'phx_reply' && msg.payload?.status === 'ok') {
        if(msg.ref && pendingBroadcasts.has(msg.ref)){ pendingBroadcasts.get(msg.ref).resolve(true); pendingBroadcasts.delete(msg.ref); }
        sendStatus('connected','Realtime connection active'); return;
      }
      if(msg.event === 'broadcast' && msg.payload?.event) {
        const e = msg.payload.event; const payload = msg.payload.payload || {};
        if(e === 'lockdown') openAlert(payload);
        else if(e === 'all-clear') closeAlert();
        else if(e === 'test' && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('remote-test', payload);
      }
      if(msg.event === 'phx_error') sendStatus('error','Realtime channel error');
    };
    socket.onerror = () => sendStatus('error','Realtime connection problem');
    socket.onclose = () => { clearInterval(heartbeatTimer); sendStatus('connecting','Reconnecting…'); setTimeout(connectRealtime, 2500); };
  } catch (err) { sendStatus('error', err.message); }
}

function broadcast(event, payload={}) {
  return new Promise((resolve,reject)=>{
    try{
      const ref=String(socketRef++);
      pendingBroadcasts.set(ref,{resolve,reject});
      wsSend(`realtime:${CHANNEL_NAME}`,'broadcast',{type:'broadcast',event,payload},ref);
      setTimeout(()=>{if(pendingBroadcasts.has(ref)){pendingBroadcasts.delete(ref);reject(new Error('Broadcast timed out'));}},5000);
    }catch(e){reject(e)}
  });
}

app.whenReady().then(async () => {
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  createMainWindow(); createTray(); await connectRealtime();
});
app.on('activate', () => { if (!mainWindow || mainWindow.isDestroyed()) createMainWindow(); else mainWindow.show(); });
app.on('window-all-closed', () => {});
app.on('before-quit', () => { app.isQuitting = true; });

ipcMain.handle('get-config', () => ({ roomName, currentAlert }));
ipcMain.handle('set-room', (_e, name) => { roomName = String(name || 'Classroom').slice(0, 50); return roomName; });
ipcMain.handle('verify-pin', (_e, pin) => String(pin) === ADMIN_PIN);
ipcMain.handle('send-lockdown', async (_e, pin) => { if (String(pin) !== ADMIN_PIN) throw new Error('Incorrect PIN'); return broadcast('lockdown', { issuedAt: Date.now(), source: 'Headteacher Control' }); });
ipcMain.handle('send-clear', async (_e, pin) => { if (String(pin) !== ADMIN_PIN) throw new Error('Incorrect PIN'); return broadcast('all-clear', { issuedAt: Date.now(), source: 'Headteacher Control' }); });
ipcMain.handle('send-test', async (_e, pin) => { if (String(pin) !== ADMIN_PIN) throw new Error('Incorrect PIN'); return broadcast('test', { issuedAt: Date.now() }); });
ipcMain.handle('local-test-alert', () => { openAlert({ issuedAt: Date.now(), test: true }); return true; });
ipcMain.handle('local-clear-alert', () => { closeAlert(); return true; });
ipcMain.on('acknowledge-alert', () => {
  if (alertWindow && !alertWindow.isDestroyed()) alertWindow.webContents.send('acknowledged');
});