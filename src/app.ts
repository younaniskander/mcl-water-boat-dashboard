// @ts-nocheck
const BLE = Object.freeze({
  deviceName: 'MCL-Water-Boat',
  service: '7b7e0001-2d8b-4c70-9c2e-8e2e5a8b0001',
  data: '7b7e0002-2d8b-4c70-9c2e-8e2e5a8b0001',
  command: '7b7e0003-2d8b-4c70-9c2e-8e2e5a8b0001'
});
const FRESH_MS = 3200;

const $ = (id) => document.getElementById(id);
const els = {
  connect: $('connectButton'), disconnect: $('disconnectButton'), stop: $('stopButton'),
  headerConnection: $('headerConnection'), headerClock: $('headerClock'), connectionPill: $('connectionPill'),
  connectionSubtext: $('connectionSubtext'), safetyIndicator: $('safetyIndicator'), safetyTitle: $('safetyTitle'),
  safetyDetail: $('safetyDetail'), browserNotice: $('browserNotice'), freshnessRing: $('freshnessRing'), freshnessText: $('freshnessText'),
  ph: $('phValue'), phVoltage: $('phVoltage'), turbidity: $('turbidityValue'), turbidityVoltage: $('turbidityVoltage'),
  ec: $('ecValue'), ecVoltage: $('ecVoltage'), salinity: $('salinityValue'), sampleAge: $('sampleAge'),
  gpsPill: $('gpsPill'), latitude: $('latitude'), longitude: $('longitude'), gpsDetail: $('gpsDetail'),
  armedLabel: document.querySelector('.armed-label'), armedText: $('armedText'), activityLog: $('activityLog'), clearLog: $('clearLogButton')
};

const state = {
  device: null,
  server: null,
  dataCharacteristic: null,
  commandCharacteristic: null,
  status: 'offline',
  lastReading: null,
  holdTimer: null,
  activeButton: null,
  writeInFlight: false,
  queuedCommand: null
};

function nowTime() {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
}

function setText(element, value) { if (element) element.textContent = value; }
function number(value, digits = 2) { return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '--'; }
function voltage(value) { return Number.isFinite(Number(value)) ? `${Number(value).toFixed(3)} V` : '-- V'; }

function showBluetoothNotice(message, includeStandaloneLink = false) {
  els.browserNotice.classList.remove('hidden');
  els.browserNotice.textContent = message;
  if (includeStandaloneLink) {
    const link = document.createElement('a');
    link.href = window.location.href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = ' Open standalone dashboard';
    els.browserNotice.append(link);
  }
}

function log(message, tone = 'normal') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${tone === 'muted' ? 'muted' : ''}`;
  entry.innerHTML = `<span class="log-time">${nowTime()}</span><span>${message}</span>`;
  els.activityLog.prepend(entry);
  while (els.activityLog.children.length > 8) els.activityLog.lastElementChild.remove();
}

function setStatus(status, detail = '') {
  state.status = status;
  const labels = { offline: 'OFFLINE', connecting: 'CONNECTING', connected: 'CONNECTED', error: 'ERROR' };
  const classes = { offline: 'neutral', connecting: 'warn', connected: 'good', error: 'bad' };
  els.connectionPill.className = `status-pill ${classes[status] || 'neutral'}`;
  setText(els.connectionPill, labels[status] || status.toUpperCase());
  setText(els.headerConnection, status === 'connected' ? 'BLE online' : `BLE ${status}`);
  setText(els.connectionSubtext, detail || (status === 'connected' ? 'Telemetry stream is active and ready.' : 'Select the boat to open a secure BLE session.'));
  document.querySelector('.live-dot').style.background = status === 'connected' ? 'var(--aqua)' : status === 'error' ? 'var(--red)' : 'var(--muted-2)';
  els.connect.disabled = status === 'connecting' || status === 'connected';
  els.disconnect.disabled = status !== 'connected' && status !== 'connecting';
  updateSafety();
}

function isFresh() { return Boolean(state.lastReading && Date.now() - state.lastReading.receivedAt < FRESH_MS); }
function isReady() { return state.status === 'connected' && Boolean(state.commandCharacteristic) && isFresh(); }

function updateSafety() {
  const ready = isReady();
  els.safetyIndicator.className = `safety-indicator ${ready ? 'ready' : 'unsafe'}`;
  els.armedLabel.className = `armed-label ${ready ? 'ready' : ''}`;
  setText(els.safetyTitle, ready ? 'Safety ready' : 'Safety locked');
  setText(els.armedText, ready ? 'READY' : 'LOCKED');
  setText(els.safetyDetail, ready ? 'Fresh telemetry received. Hold a motor control to run.' : state.status === 'connected' ? 'Waiting for fresh telemetry before propulsion is armed.' : 'Connect and receive fresh telemetry before propulsion is armed.');
  document.querySelectorAll('.motor-button').forEach((button) => { button.disabled = !ready; });
}

function renderReading(payload) {
  state.lastReading = { ...payload, receivedAt: Date.now() };
  setText(els.ph, number(payload.ph)); setText(els.phVoltage, voltage(payload.phVoltage));
  setText(els.turbidity, number(payload.turbidityNTU, 1)); setText(els.turbidityVoltage, voltage(payload.turbidityVoltage));
  setText(els.ec, number(payload.ecMsCm)); setText(els.ecVoltage, voltage(payload.ecVoltage));
  setText(els.salinity, number(payload.salinityPpt));
  const gpsValid = payload.gpsValid === true && Number.isFinite(Number(payload.lat)) && Number.isFinite(Number(payload.lng));
  setText(els.gpsPill, gpsValid ? 'VALID FIX' : 'NO FIX');
  els.gpsPill.className = `status-pill ${gpsValid ? 'good' : 'neutral'}`;
  setText(els.latitude, gpsValid ? Number(payload.lat).toFixed(6) : '--.------');
  setText(els.longitude, gpsValid ? Number(payload.lng).toFixed(6) : '--.------');
  setText(els.gpsDetail, gpsValid ? 'Coordinates are current from the onboard GPS receiver.' : 'Waiting for a valid GPS report from the boat.');
  setText(els.freshnessText, 'Telemetry fresh');
  els.freshnessRing.className = 'freshness-ring fresh';
  updateSafety();
}

function handleData(event) {
  try {
    const raw = new TextDecoder().decode(event.target.value);
    const payload = JSON.parse(raw);
    if (payload.type === 'water') renderReading(payload);
  } catch {
    log('Received an unreadable telemetry packet.', 'muted');
  }
}

async function flushCommands() {
  if (state.writeInFlight || !state.commandCharacteristic) return;
  state.writeInFlight = true;
  try {
    while (state.queuedCommand && state.commandCharacteristic) {
      const command = state.queuedCommand;
      state.queuedCommand = null;
      await state.commandCharacteristic.writeValue(new TextEncoder().encode(command));
    }
  } catch {
    log('Command write failed; propulsion is locked.', 'muted');
    setStatus('error', 'The command channel stopped responding. Disconnect and retry.');
  } finally {
    state.writeInFlight = false;
  }
}

function sendCommand(command) {
  if (!state.commandCharacteristic) return;
  state.queuedCommand = command;
  void flushCommands();
}

function stopMotors(reason = 'Stop command sent.') {
  if (state.holdTimer) window.clearInterval(state.holdTimer);
  state.holdTimer = null;
  if (state.activeButton) state.activeButton.classList.remove('holding');
  state.activeButton = null;
  sendCommand('STOP');
  if (reason) log(reason, reason.toLowerCase().includes('emergency') ? 'normal' : 'muted');
}

function startHold(button, command) {
  if (!isReady()) return;
  if (state.activeButton && state.activeButton !== button) stopMotors('Previous motor hold cancelled.');
  state.activeButton = button;
  button.classList.add('holding');
  sendCommand(command);
  state.holdTimer = window.setInterval(() => { if (isReady()) sendCommand(command); else stopMotors('Telemetry became stale; motor hold cancelled.'); }, 260);
}

async function connectBoat() {
  if (!navigator.bluetooth) {
    showBluetoothNotice('Web Bluetooth is unavailable here. Open this dashboard in Chrome or Edge over HTTPS.');
    setStatus('error', 'This browser does not expose Web Bluetooth.');
    return;
  }
  try {
    setStatus('connecting', 'Choose MCL-Water-Boat in the Bluetooth picker.');
    const device = await navigator.bluetooth.requestDevice({ filters: [{ name: BLE.deviceName, services: [BLE.service] }], optionalServices: [BLE.service] });
    state.device = device;
    state.device.addEventListener('gattserverdisconnected', handleDisconnect);
    state.server = await device.gatt.connect();
    const service = await state.server.getPrimaryService(BLE.service);
    state.dataCharacteristic = await service.getCharacteristic(BLE.data);
    state.commandCharacteristic = await service.getCharacteristic(BLE.command);
    state.dataCharacteristic.addEventListener('characteristicvaluechanged', handleData);
    await state.dataCharacteristic.startNotifications();
    setStatus('connected', 'Telemetry stream is active and ready.');
    log('BLE link established with MCL-Water-Boat.');
  } catch (error) {
    if (error.name === 'NotFoundError') {
      setStatus('offline', 'Bluetooth selection was cancelled.');
      log('Bluetooth selection cancelled.', 'muted');
    } else if (error.name === 'SecurityError' || /permissions policy|disallowed by permissions policy|not allowed/i.test(error.message || '')) {
      showBluetoothNotice('This embedded Preview frame blocks Bluetooth by browser permissions policy. Open the standalone HTTPS dashboard in Chrome or Edge, then connect there.', true);
      setStatus('error', 'Bluetooth is blocked inside the embedded Preview frame.');
      log('Bluetooth was blocked by the embedded Preview permissions policy.', 'muted');
    } else {
      setStatus('error', error.message || 'Unable to open the BLE session.');
      log('BLE connection failed. Check power, range, and UUIDs.', 'muted');
    }
    clearConnection(false);
  }
}

function handleDisconnect() {
  stopMotors(null);
  clearConnection(false);
  setStatus('offline', 'The boat disconnected. Propulsion is stopped.');
  log('BLE link disconnected; motors stopped.', 'muted');
}

function clearConnection(logIt = true) {
  state.dataCharacteristic = null;
  state.commandCharacteristic = null;
  state.server = null;
  state.lastReading = null;
  setText(els.freshnessText, 'Waiting for data');
  els.freshnessRing.className = 'freshness-ring';
  updateSafety();
  if (logIt) log('Session closed; motors stopped.', 'muted');
}

async function disconnectBoat() {
  stopMotors('Disconnect requested; motors stopped.');
  if (state.device?.gatt?.connected) state.device.gatt.disconnect();
  clearConnection(false);
  setStatus('offline', 'Select the boat to open a secure BLE session.');
}

function bindMotorControls() {
  document.querySelectorAll('.motor-button').forEach((button) => {
    const command = button.dataset.command;
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); startHold(button, command); });
    button.addEventListener('pointerup', () => stopMotors('Motor hold released; STOP sent.'));
    button.addEventListener('pointercancel', () => stopMotors('Motor control cancelled; STOP sent.'));
    button.addEventListener('pointerleave', () => { if (state.activeButton === button) stopMotors('Motor control left; STOP sent.'); });
    button.addEventListener('keydown', (event) => { if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) { event.preventDefault(); startHold(button, command); } });
    button.addEventListener('keyup', (event) => { if (event.key === 'Enter' || event.key === ' ') stopMotors('Motor hold released; STOP sent.'); });
  });
}

function updateClock() { setText(els.headerClock, nowTime()); if (state.lastReading) { const age = Date.now() - state.lastReading.receivedAt; setText(els.sampleAge, `${(age / 1000).toFixed(1)}s ago`); if (age >= FRESH_MS) { setText(els.freshnessText, 'Telemetry stale'); els.freshnessRing.className = 'freshness-ring stale'; updateSafety(); } } }

els.connect.addEventListener('click', connectBoat);
els.disconnect.addEventListener('click', disconnectBoat);
els.stop.addEventListener('click', () => stopMotors('Emergency stop sent.'));
els.clearLog.addEventListener('click', () => { els.activityLog.innerHTML = '<div class="log-entry muted"><span class="log-time">--:--:--</span><span>Activity log cleared.</span></div>'; });
window.addEventListener('blur', () => { if (state.activeButton) stopMotors('Window focus lost; STOP sent.'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopMotors(null); });
window.addEventListener('beforeunload', () => { if (state.commandCharacteristic) sendCommand('STOP'); });
bindMotorControls();
if (!navigator.bluetooth) showBluetoothNotice('Web Bluetooth is unavailable in this browser. Use Chrome or Edge over HTTPS.');
setStatus('offline');
setInterval(updateClock, 250);
updateClock();
