require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const pdnsClient = require('./lib/pdns-client');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for CDN resources
}));
app.use(compression());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'ndash-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    return next();
  }
  res.redirect('/login');
}

// Routes
app.get('/login', (req, res) => {
  // If already authenticated, redirect to dashboard
  if (req.session.authenticated) {
    return res.redirect('/');
  }
  res.render('login', {
    title: 'Login - NDash'
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Simple authentication - in production, use proper authentication
  const validUsername = process.env.ADMIN_USERNAME || 'admin';
  const validPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (username === validUsername && password === validPassword) {
    req.session.authenticated = true;
    req.session.username = username;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid username or password' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
    res.redirect('/login');
  });
});
app.get('/', requireAuth, (req, res) => {
  res.render('index', {
    title: 'NDash - PowerDNS Dashboard',
    page: 'dashboard',
    username: req.session.username
  });
});

app.get('/zones', requireAuth, (req, res) => {
  res.render('zones', {
    title: 'DNS Zones - NDash',
    page: 'zones',
    username: req.session.username
  });
});

app.get('/statistics', requireAuth, (req, res) => {
  res.render('statistics', {
    title: 'Statistics - NDash',
    page: 'statistics',
    username: req.session.username
  });
});

app.get('/settings', requireAuth, (req, res) => {
  res.render('settings', {
    title: 'Settings - NDash',
    page: 'settings',
    username: req.session.username
  });
});

// API Routes - Servers
app.get('/api/servers', requireAuth, async (req, res) => {
  try {
    const servers = await pdnsClient.getServers();
    res.json(servers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API Routes - Zones
app.get('/api/servers/:serverId/zones', requireAuth, async (req, res) => {
  try {
    const zones = await pdnsClient.getZones(req.params.serverId);
    res.json(zones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/servers/:serverId/zones/:zoneId', requireAuth, async (req, res) => {
  try {
    const zone = await pdnsClient.getZone(req.params.serverId, req.params.zoneId);
    res.json(zone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/servers/:serverId/zones', requireAuth, async (req, res) => {
  try {
    console.log('Creating zone with data:', req.body);
    const zone = await pdnsClient.createZone(req.params.serverId, req.body);
    res.json(zone);
  } catch (error) {
    console.error('Error creating zone:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/servers/:serverId/zones/:zoneId', requireAuth, async (req, res) => {
  try {
    await pdnsClient.deleteZone(req.params.serverId, req.params.zoneId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API Routes - Records
app.patch('/api/servers/:serverId/zones/:zoneId', requireAuth, async (req, res) => {
  try {
    await pdnsClient.updateRecords(req.params.serverId, req.params.zoneId, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Statistics
app.get('/api/servers/:serverId/statistics', requireAuth, async (req, res) => {
  try {
    const stats = await pdnsClient.getStatistics(req.params.serverId);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Not Found',
    message: 'Page not found',
    page: 'error'
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: '500 - Server Error',
    message: err.message || 'Something went wrong',
    page: 'error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 NDash PowerDNS Dashboard running on http://localhost:${PORT}`);
  console.log(`📡 PowerDNS API: ${process.env.PDNS_API_URL}`);
});
