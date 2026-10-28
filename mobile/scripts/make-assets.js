// Draws the source pictures for the app icon and splash screen (assets/*.png).
// Needs Playwright. Then run `npm run icons` to make every Android size.
const { chromium } = require('playwright');
const path = require('path');
const sprout = '<path d="M12 21v-9"/><path d="M12 12C12 7 8.5 4 4 4c0 5 3.5 8 8 8z"/><path d="M12 14c0-4 2.8-6.5 7-6.5 0 4-2.8 6.5-7 6.5z"/>';
const out = path.join(__dirname, '..', 'assets');

// bg: background colour or null, fg: sprout colour, scale: sprout size (24 units * scale out of 100)
const svg = (size, bg, fg, scale) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  ${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''}
  <g transform="translate(${50 - 12 * scale} ${50 - 12.5 * scale}) scale(${scale})" fill="none" stroke="${fg}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${sprout}</g></svg>`;

// Splash: sprout in a rounded sage square in the middle of a paper background
const splash = (size, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1000 1000">
  <rect width="1000" height="1000" fill="${bg}"/>
  <rect x="425" y="425" width="150" height="150" rx="34" fill="#4f7a6a"/>
  <g transform="translate(${500 - 12 * 4} ${500 - 12.5 * 4}) scale(4)" fill="none" stroke="#f5f2ec" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${sprout}</g></svg>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (name, size, markup) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
    await p.screenshot({ path: path.join(out, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  await shot('icon-only.png', 1024, svg(1024, '#4f7a6a', '#f5f2ec', 2.2));
  await shot('icon-foreground.png', 1024, svg(1024, null, '#f5f2ec', 1.6));
  await shot('icon-background.png', 1024, `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#4f7a6a"/></svg>`);
  await shot('splash.png', 2732, splash(2732, '#f5f2ec'));
  await shot('splash-dark.png', 2732, splash(2732, '#1d2421'));
  await b.close();
  console.log('Made the pictures in assets/');
})();
