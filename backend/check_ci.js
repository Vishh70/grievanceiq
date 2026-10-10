const https = require('https');
https.get({
  hostname: 'api.github.com',
  path: '/repos/Vishh70/grievanceiq/actions/runs',
  headers: { 'User-Agent': 'node.js' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const runs = JSON.parse(data).workflow_runs;
      const latest = runs[0];
      console.log('Latest Run ID:', latest.id, 'Status:', latest.status, 'Conclusion:', latest.conclusion);
      console.log('Commit:', latest.head_commit.message);
    } catch(e) {}
  });
}).on('error', () => {});
