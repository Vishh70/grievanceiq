const https = require('https');

https.get('https://github.com/Vishh70/grievanceiq/actions', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('HTML Length:', data.length);
    // Find commit messages and statuses
    const lines = data.split('\n');
    const recentCommits = lines.filter(l => l.includes('fix: allow graceful test skipping') || l.includes('fix: cleanup process.env.MOCK_REDIS'));
    console.log('Found commits:', recentCommits.length);
    if (recentCommits.length > 0) {
      console.log(recentCommits.map(l => l.substring(0, 200)));
    }
    
    const failures = data.match(/This workflow run failed/g);
    console.log('Failed badges count:', failures ? failures.length : 0);
  });
}).on('error', console.error);
