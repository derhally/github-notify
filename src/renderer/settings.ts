import './styles.css';
import { NotificationMode, NotificationSound } from '../shared/types';

const app = document.getElementById('app')!;

app.innerHTML = `
  <h1>GitHub Notify Settings</h1>

  <div class="form-group">
    <label for="token">GitHub Personal Access Token</label>
    <div class="token-row">
      <input type="password" id="token" placeholder="ghp_xxxxxxxxxxxx" />
      <button type="button" id="toggle-visibility">Show</button>
      <button type="button" id="test-connection">Test</button>
    </div>
    <div id="token-status" class="status-message"></div>
    <div class="hint">Needs <code>repo</code> scope for private repos, or <code>public_repo</code> for public only.</div>
  </div>

  <div class="form-group">
    <label for="poll-interval">Poll Interval</label>
    <div class="interval-row">
      <input type="number" id="poll-interval" min="60" max="3600" step="30" />
      <span>seconds (60–3600)</span>
    </div>
  </div>

  <div class="form-group">
    <label for="notification-mode">Notification Mode</label>
    <select id="notification-mode">
      <option value="${NotificationMode.Toast}">Toast Notification</option>
      <option value="${NotificationMode.TTS}">Text-to-Speech</option>
      <option value="${NotificationMode.Both}">Both</option>
    </select>
  </div>

  <div class="form-group">
    <label for="notification-sound">Notification Sound</label>
    <select id="notification-sound">
      <option value="${NotificationSound.Default}">System Default</option>
      <option value="${NotificationSound.Custom}">Custom Sound</option>
      <option value="${NotificationSound.None}">None</option>
    </select>
  </div>

  <div class="form-group" id="custom-sound-group" style="display: none;">
    <label for="custom-sound-path">Sound File (.wav)</label>
    <div class="file-row">
      <input type="text" id="custom-sound-path" readonly placeholder="No file selected" />
      <button type="button" id="browse-sound">Browse</button>
    </div>
  </div>

  <div class="form-group">
    <div class="toggle-row">
      <label>Quiet Hours</label>
      <label class="toggle">
        <input type="checkbox" id="quiet-hours-enabled" />
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>

  <div class="form-group" id="quiet-hours-times" style="display: none;">
    <label>Schedule</label>
    <div class="time-row">
      <input type="time" id="quiet-hours-start" />
      <span>to</span>
      <input type="time" id="quiet-hours-end" />
    </div>
    <div class="hint">Notifications are suppressed during this window. Polling continues normally.</div>
  </div>

  <div class="form-group">
    <div class="toggle-row">
      <label>Mute During Calls</label>
      <label class="toggle">
        <input type="checkbox" id="mic-mute-enabled" />
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="hint">Automatically suppress notifications when your microphone is in use.</div>
  </div>

  <div class="form-group">
    <div class="toggle-row">
      <label>Start with Windows</label>
      <label class="toggle">
        <input type="checkbox" id="auto-start" />
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>

  <div class="form-group">
    <label for="filters">Org/Repo Allowlist</label>
    <textarea id="filters" placeholder="org-name&#10;owner/repo-name&#10;(empty = monitor all)"></textarea>
    <div class="hint">One per line. Use <code>org-name</code> for all repos in an org, or <code>owner/repo</code> for a specific repo. Leave empty to monitor everything.</div>
  </div>

  <div class="actions">
    <button type="button" class="primary" id="save">Save Settings</button>
  </div>
`;

const tokenInput = document.getElementById('token') as HTMLInputElement;
const toggleVisibilityBtn = document.getElementById('toggle-visibility') as HTMLButtonElement;
const testConnectionBtn = document.getElementById('test-connection') as HTMLButtonElement;
const tokenStatus = document.getElementById('token-status') as HTMLDivElement;
const pollIntervalInput = document.getElementById('poll-interval') as HTMLInputElement;
const notificationModeSelect = document.getElementById('notification-mode') as HTMLSelectElement;
const notificationSoundSelect = document.getElementById('notification-sound') as HTMLSelectElement;
const customSoundGroup = document.getElementById('custom-sound-group') as HTMLDivElement;
const customSoundPathInput = document.getElementById('custom-sound-path') as HTMLInputElement;
const browseSoundBtn = document.getElementById('browse-sound') as HTMLButtonElement;
const quietHoursEnabledCheckbox = document.getElementById('quiet-hours-enabled') as HTMLInputElement;
const quietHoursTimesGroup = document.getElementById('quiet-hours-times') as HTMLDivElement;
const quietHoursStartInput = document.getElementById('quiet-hours-start') as HTMLInputElement;
const quietHoursEndInput = document.getElementById('quiet-hours-end') as HTMLInputElement;
const micMuteEnabledCheckbox = document.getElementById('mic-mute-enabled') as HTMLInputElement;
const autoStartCheckbox = document.getElementById('auto-start') as HTMLInputElement;
const filtersTextarea = document.getElementById('filters') as HTMLTextAreaElement;
const saveBtn = document.getElementById('save') as HTMLButtonElement;

toggleVisibilityBtn.addEventListener('click', () => {
  if (tokenInput.type === 'password') {
    tokenInput.type = 'text';
    toggleVisibilityBtn.textContent = 'Hide';
  } else {
    tokenInput.type = 'password';
    toggleVisibilityBtn.textContent = 'Show';
  }
});

notificationSoundSelect.addEventListener('change', () => {
  customSoundGroup.style.display = notificationSoundSelect.value === NotificationSound.Custom ? '' : 'none';
});

quietHoursEnabledCheckbox.addEventListener('change', () => {
  quietHoursTimesGroup.style.display = quietHoursEnabledCheckbox.checked ? '' : 'none';
});

browseSoundBtn.addEventListener('click', async () => {
  const filePath = await window.electronAPI.openSoundFileDialog();
  if (filePath) {
    customSoundPathInput.value = filePath;
  }
});

testConnectionBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    tokenStatus.textContent = 'Please enter a token first.';
    tokenStatus.className = 'status-message error';
    return;
  }

  testConnectionBtn.disabled = true;
  testConnectionBtn.textContent = 'Testing...';
  tokenStatus.textContent = '';

  try {
    const result = await window.electronAPI.testConnection(token);
    tokenStatus.textContent = result.message;
    tokenStatus.className = `status-message ${result.success ? 'success' : 'error'}`;
  } catch {
    tokenStatus.textContent = 'Connection test failed unexpectedly.';
    tokenStatus.className = 'status-message error';
  } finally {
    testConnectionBtn.disabled = false;
    testConnectionBtn.textContent = 'Test';
  }
});

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;

  try {
    const token = tokenInput.value.trim();
    if (token) {
      await window.electronAPI.saveToken(token);
    }

    const pollInterval = Math.max(60, Math.min(3600, parseInt(pollIntervalInput.value, 10) || 300));
    pollIntervalInput.value = String(pollInterval);

    const filters = filtersTextarea.value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    await window.electronAPI.saveSettings({
      pollInterval,
      notificationMode: notificationModeSelect.value as NotificationMode,
      notificationSound: notificationSoundSelect.value as NotificationSound,
      customSoundPath: customSoundPathInput.value,
      autoStart: autoStartCheckbox.checked,
      filters,
      quietHoursEnabled: quietHoursEnabledCheckbox.checked,
      quietHoursStart: quietHoursStartInput.value || '22:00',
      quietHoursEnd: quietHoursEndInput.value || '08:00',
      micMuteEnabled: micMuteEnabledCheckbox.checked,
    });

    saveBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveBtn.textContent = 'Save Settings';
    }, 1500);
  } catch {
    saveBtn.textContent = 'Save Failed';
    setTimeout(() => {
      saveBtn.textContent = 'Save Settings';
    }, 2000);
  } finally {
    saveBtn.disabled = false;
  }
});

async function loadSettings(): Promise<void> {
  const settings = await window.electronAPI.getSettings();
  pollIntervalInput.value = String(settings.pollInterval);
  notificationModeSelect.value = settings.notificationMode;
  notificationSoundSelect.value = settings.notificationSound;
  customSoundPathInput.value = settings.customSoundPath;
  customSoundGroup.style.display = settings.notificationSound === NotificationSound.Custom ? '' : 'none';
  quietHoursEnabledCheckbox.checked = settings.quietHoursEnabled;
  quietHoursStartInput.value = settings.quietHoursStart;
  quietHoursEndInput.value = settings.quietHoursEnd;
  quietHoursTimesGroup.style.display = settings.quietHoursEnabled ? '' : 'none';
  micMuteEnabledCheckbox.checked = settings.micMuteEnabled;
  autoStartCheckbox.checked = settings.autoStart;
  filtersTextarea.value = settings.filters.join('\n');

  const hasExistingToken = await window.electronAPI.hasToken();
  if (hasExistingToken) {
    tokenInput.placeholder = '••••••••••••••••••• (token saved)';
  }
}

loadSettings();
