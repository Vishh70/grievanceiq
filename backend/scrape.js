const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('https://github.com/Vishh70/grievanceiq/actions/runs/37651561071/job/112895913536', { waitUntil: 'networkidle2' });
  const text = await page.evaluate(() => document.body.innerText);
  const lines = text.split('\n');
  const failLines = lines.filter(l => l.includes('FAIL'));
  console.log('FAIL Occurrences:');
  failLines.forEach(l => console.log(l));
  console.log('\n--- Full Bottom 200 lines ---');
  console.log(lines.slice(-200).join('\n'));
  await browser.close();
})();
