// Supply the installed Chrome path to the existing browser suites on Linux/macOS.
// Example: CHROME_PATH=/usr/bin/google-chrome node --import ./.tools/browser-test-env.mjs .tools/qa.mjs
import { chromium } from 'playwright-core';
if (process.env.CHROME_PATH) {
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async (options = {}) => {
    const browser = await launch({ ...options, executablePath: process.env.CHROME_PATH,
      args: [...(options.args ?? []), '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    if (process.env.KINO_CI_DPR) {
      // Keep CSS layout and input coordinates intact while reducing software-GPU fill cost.
      for (const method of ['newContext', 'newPage']) {
        const create = browser[method].bind(browser);
        browser[method] = (options = {}) => create({ deviceScaleFactor: Number(process.env.KINO_CI_DPR), ...options });
      }
    }
    return browser;
  };
}
