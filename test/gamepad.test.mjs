import test from 'node:test';
import assert from 'node:assert/strict';
import { GamepadInput, stick, normalizeSettings, controllerLabels } from '../export/web/gamepad-controls.js';
const pad = (buttons = [], axes = [0, 0, 0, 0], id = 'Xbox Wireless Controller', index = 0) => ({ id, index, connected: true, mapping: 'standard', axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })) });

test('radial dead zones reject drift, retain analog walking, and cap diagonals', () => {
  assert.deepEqual(stick(.05, .05), [0, 0]);
  assert(stick(.5, 0)[0] > 0 && stick(.5, 0)[0] < .5);
  assert(Math.abs(Math.hypot(...stick(1, 1)) - 1) < 1e-10);
  assert.deepEqual(stick(NaN, Infinity), [0, 0]);
  assert(stick(.5, 0, .15, 1.5)[0] < stick(.5, 0)[0]);
});
test('settings recover from malformed storage and clamp extreme sensitivity', () => {
  assert.deepEqual(normalizeSettings({ sensitivity: NaN, adsSensitivity: 5, deadzone: -1, invertY: 'false' }), { sensitivity: 1, adsSensitivity: 1, deadzone: .05, invertY: false });
});
test('triggers expose held fire with one press edge, and analog axes use the standard layout', () => {
  const input = new GamepadInput(); input.read([pad()]);
  const first = input.read([pad([6, 7], [.4, -.8, .7, -.3])]);
  assert(first.fire && first.aim && first.pressed[7]);
  assert(first.forward > 0 && first.strafe > 0 && first.lookX > 0 && first.lookY < 0);
  const held = input.read([pad([7])]); assert(held.fire); assert(!held.pressed[7]);
  input.read([pad()]); assert(input.read([pad([7])]).pressed[7]);
});
test('connect and resume suppress held buttons until all buttons are released', () => {
  const input = new GamepadInput(); assert(!input.read([pad([7])]).fire);
  assert(!input.read([pad([7])]).pressed[7]); input.read([pad()]);
  assert(input.read([pad([7])]).fire); input.reset();
  assert(!input.read([pad([7])]).fire); input.read([pad()]);
  assert(input.read([pad([7])]).pressed[7]);
});
test('disconnect, sparse arrays, and replacement controllers clear held input', () => {
  const input = new GamepadInput(); input.read([null, pad([], undefined, 'Xbox', 1)]);
  assert(input.read([null, pad([7], undefined, 'Xbox', 1)]).fire);
  const gone = input.read([null]); assert(gone.disconnected && !gone.fire && !gone.connected);
  const swapped = input.read([pad([7], undefined, 'DualSense')]); assert(swapped.connected && !swapped.fire);
  input.read([pad([], undefined, 'DualSense')]); assert(input.read([pad([7], undefined, 'DualSense')]).pressed[7]);
});
test('unsupported mappings do not produce guessed gameplay controls', () => {
  const input = new GamepadInput(); const state = input.read([{ ...pad([7]), mapping: '' }]);
  assert(state.unsupported && !state.connected && !state.fire);
});
test('PlayStation and Xbox use distinct labels on the same standard mapping', () => {
  assert.equal(controllerLabels('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)').fire, 'R2');
  assert.equal(controllerLabels('Xbox Wireless Controller').use, 'X');
});
