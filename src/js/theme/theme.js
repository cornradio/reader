/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import config from '../data/config.js';

const theme = {};

export default theme;

const callbackList = [];
const triggerCallback = function (isLight) {
  callbackList.forEach(callback => {
    callback(isLight ? 'light' : 'dark');
  });
};

const PRESETS = {
  light: { chrome: 'light', text: '#000000', background: '#ffffff' },
  sepia: { chrome: 'light', text: '#5b4636', background: '#f4ecd8' },
  green: { chrome: 'light', text: '#1b3a28', background: '#d7ead2' },
  gray: { chrome: 'light', text: '#2c2c2c', background: '#e6e6e6' },
  dark: { chrome: 'dark', text: '#ffffff', background: '#000000' },
  night: { chrome: 'dark', text: '#d7cbb8', background: '#1c1814' },
  ocean: { chrome: 'dark', text: '#d5e6f2', background: '#0d1b26' },
  ink: { chrome: 'dark', text: '#e4dcc8', background: '#10141c' },
};

let currentTheme = 'dark';
let autoUseLight = false;
let lastTheme = null;
const chromeOf = function () {
  const preset = PRESETS[currentTheme];
  if (preset) return preset.chrome;
  if (currentTheme === 'light') return 'light';
  if (currentTheme === 'auto' && autoUseLight) return 'light';
  return 'dark';
};
const updateTheme = function () {
  const useLightTheme = chromeOf() === 'light';
  if (useLightTheme === lastTheme) return;
  lastTheme = useLightTheme;
  triggerCallback(useLightTheme);
};
const updateAutoTheme = function (useLightTheme) {
  autoUseLight = useLightTheme;
  updateTheme();
};
const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
updateAutoTheme(mediaQuery.matches);
mediaQuery.addListener(event => { updateAutoTheme(event.matches); });
const updateConfigTheme = (name, applyColors) => {
  currentTheme = name || 'auto';
  updateTheme();
  const preset = applyColors ? PRESETS[currentTheme] : null;
  if (!preset) return;
  const prefix = preset.chrome === 'light' ? 'light' : 'dark';
  config.set(prefix + '_text', preset.text);
  config.set(prefix + '_background', preset.background);
};
config.addListener('theme', name => { updateConfigTheme(name, true); });
config.get('theme', 'auto').then(name => { updateConfigTheme(name, false); });

theme.getCurrent = function () {
  return chromeOf();
};

theme.addChangeListener = function (callback) {
  if (callbackList.includes(callback)) return;
  callbackList.push(callback);
};

theme.removeChangeListener = function (callback) {
  const pos = callbackList.indexOf(callback);
  if (pos !== -1) callbackList.splice(pos, 1);
};

