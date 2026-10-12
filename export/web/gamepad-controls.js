const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const defaults = Object.freeze({ sensitivity: 1, adsSensitivity: .45, deadzone: .15, invertY: false });
export function normalizeSettings(value = {}) {
  const number = (key, lo, hi) => Number.isFinite(value[key]) ? clamp(value[key], lo, hi) : defaults[key];
  return { sensitivity: number('sensitivity', .25, 3), adsSensitivity: number('adsSensitivity', .15, 1), deadzone: number('deadzone', .05, .4), invertY: value.invertY === true };
}
// Radial dead zones keep diagonal movement round and retain analog walking.
export function stick(x = 0, y = 0, deadzone = .15, curve = 1) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [0, 0];
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone) return [0, 0];
  const scaled = ((Math.min(1, magnitude) - deadzone) / (1 - deadzone)) ** curve;
  return [x / magnitude * scaled, y / magnitude * scaled];
}
export function controllerLabels(id = '') {
  const ps = /054c|sony|dualsense|dualshock|playstation|wireless controller/i.test(id) && !/xbox/i.test(id);
  return ps ? { jump: 'Cross', crouch: 'Circle', use: 'Square', weapon: 'Triangle', aim: 'L2', fire: 'R2', grenade: 'R1', equipment: 'L1', pause: 'Options', sprint: 'L3', melee: 'R3' }
    : { jump: 'A', crouch: 'B', use: 'X', weapon: 'Y', aim: 'LT', fire: 'RT', grenade: 'RB', equipment: 'LB', pause: 'Menu', sprint: 'LS', melee: 'RS' };
}

export class GamepadInput {
  constructor(settings) { this.settings = normalizeSettings(settings); this.index = null; this.id = ''; this.previous = []; this.armed = false; this.connected = false; }
  reset() { this.armed = false; }
  read(pads = []) {
    const available = Array.from(pads).filter(p => p?.connected && p.mapping === 'standard');
    const pad = available.find(p => p.index === this.index && p.id === this.id) ?? available[0];
    const oldId = this.id, oldIndex = this.index, wasConnected = this.connected;
    this.connected = !!pad; this.index = pad?.index ?? null; this.id = pad?.id ?? '';
    const changed = oldIndex !== this.index || oldId !== this.id;
    const buttons = Array.from({ length: 17 }, (_, i) => !!pad?.buttons[i]?.pressed || (pad?.buttons[i]?.value ?? 0) > .5);
    if (changed) { this.armed = false; this.previous = buttons; }
    const pressed = buttons.map((value, i) => this.armed && value && !this.previous[i]);
    const enabled = this.armed;
    this.previous = buttons;
    if (!buttons.some(Boolean)) this.armed = true;
    const [strafe, y] = pad ? stick(pad.axes[0], pad.axes[1], this.settings.deadzone) : [0, 0];
    const [lookX, lookY] = pad ? stick(pad.axes[2], pad.axes[3], this.settings.deadzone, 1.5) : [0, 0];
    return { connected: this.connected, changed, disconnected: wasConnected && changed, id: this.id,
      unsupported: !pad && Array.from(pads).some(p => p?.connected), pressed,
      activity: enabled && (buttons.some(Boolean) || Math.hypot(strafe, y, lookX, lookY) > .02),
      forward: enabled ? -y : 0, strafe: enabled ? strafe : 0, lookX: enabled ? lookX : 0, lookY: enabled ? lookY : 0,
      fire: enabled && buttons[7], aim: enabled && buttons[6], use: enabled && buttons[2], jump: enabled && buttons[0] };
  }
}

export function createGamepadControls() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem('kino.controller') ?? '{}'); } catch {}
  const input = new GamepadInput(saved ?? {});
  const panel = document.createElement('details'); panel.id = 'controller-settings';
  panel.innerHTML = `<summary>CONTROLLER <span id="controller-status">Connect a controller and press a button</span></summary>
    <p>Xbox and PlayStation controllers · USB or Bluetooth. Click the game once to enable sound.</p>
    <label>Look sensitivity <input data-setting="sensitivity" type="range" min="0.25" max="3" step="0.05"><output></output></label>
    <label>Aiming sensitivity <input data-setting="adsSensitivity" type="range" min="0.15" max="1" step="0.05"><output></output></label>
    <label>Stick dead zone <input data-setting="deadzone" type="range" min="0.05" max="0.4" step="0.01"><output></output></label>
    <label class="controller-invert"><input data-setting="invertY" type="checkbox"> Invert vertical look</label>
    <p id="controller-layout"></p><p>D-pad ↓ Claymore · D-pad ↑ weapon attachment<br>Menus: D-pad to navigate, left/right to adjust, A/Cross to select.</p>`;
  document.querySelector('.menu-content').append(panel);
  for (const field of panel.querySelectorAll('input')) {
    const key = field.dataset.setting;
    if (field.type === 'checkbox') field.checked = input.settings[key]; else field.value = input.settings[key];
    const output = field.nextElementSibling;
    const show = () => { if (output?.tagName === 'OUTPUT') output.value = Number(field.value).toFixed(2); };
    show(); field.addEventListener('input', () => {
      input.settings = normalizeSettings({ ...input.settings, [key]: field.type === 'checkbox' ? field.checked : Number(field.value) });
      show(); try { localStorage.setItem('kino.controller', JSON.stringify(input.settings)); } catch {}
    });
  }
  let status = '', labels = controllerLabels(), last = {};
  const paintStatus = state => {
    const next = state.connected ? 'Connected · ' + state.id : state.unsupported ? 'Unrecognized layout — try Chrome with a USB cable' : 'Connect a controller and press a button';
    if (next === status) return;
    status = next; panel.querySelector('#controller-status').textContent = status; labels = controllerLabels(state.id);
    panel.querySelector('#controller-layout').textContent = `${labels.aim} aim · ${labels.fire} fire · ${labels.jump} jump · ${labels.crouch} crouch · ${labels.use} reload / use (hold to repair) · ${labels.weapon} switch weapon · ${labels.sprint} sprint · ${labels.melee} knife · ${labels.grenade} grenade · ${labels.equipment} Monkey Bomb · ${labels.pause} pause`;
  };
  return {
    input,
    get labels() { return labels; },
    poll() { let pads = []; try { pads = navigator.getGamepads?.() ?? []; } catch {} last = input.read(pads); paintStatus(last); return last; },
    snapshot: () => ({ connected: input.connected, id: input.id, settings: { ...input.settings } }),
    menu(state) {
      const options = Array.from(document.querySelectorAll('#menu button:not(:disabled), #menu summary, #menu input')).filter(el => el.getClientRects().length);
      if (!options.length) return;
      let focus = document.activeElement, index = options.indexOf(focus);
      if (state.pressed[12] || state.pressed[13]) {
        index = index < 0 ? 0 : (index + (state.pressed[13] ? 1 : -1) + options.length) % options.length;
        focus = options[index]; focus.focus(); focus.scrollIntoView({ block: 'nearest' });
      }
      if ((state.pressed[14] || state.pressed[15]) && focus?.type === 'range') {
        if (state.pressed[15]) focus.stepUp(); else focus.stepDown();
        focus.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (state.pressed[0]) {
        if (index < 0) focus = document.getElementById('start');
        if (!focus?.disabled && focus?.type !== 'range') focus?.click();
      }
    },
  };
}
