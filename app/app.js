const express = require('express');
const app = express();

app.get('/', (req, res) => res.json({ 
  status: 'ok', service: 'webapp',
  timestamp: new Date().toISOString()
}));
app.get('/health', (req, res) => res.json({ status: 'healthy', uptime: process.uptime() }));
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`app_uptime_seconds ${process.uptime()}\n`);
});

app.listen(process.env.PORT || 3000, () => console.log('App running on port 3000'));
