// Supply the installed Chrome path to the existing browser suites on Linux/macOS.
// Example: CHROME_PATH=/usr/bin/google-chrome node --import ./.tools/browser-test-env.mjs .tools/qa.mjs
import { chromium } from 'playwright-core';
if (process.env.CHROME_PATH) {
  const launch = chromium.launch.bind(chromium);
  chromium.launch = (options = {}) => launch({ ...options, executablePath: process.env.CHROME_PATH,
    args: [...(options.args ?? []), '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
}
