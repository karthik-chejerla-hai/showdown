const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const db = require('./db');
const { passport, requireAuth, isAuthConfigured } = require('./auth');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Session middleware (required for Passport)
app.use(session({
    secret: process.env.SESSION_SECRET || 'badminton-showdown-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(__dirname));

// Load players from CSV
function loadPlayers() {
    const csvPath = path.join(__dirname, 'players.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
        skip_empty_lines: true,
        trim: true
    });
    // CSV has single column with player names
    return records.map(row => row[0]).filter(name => name && name.trim());
}

// Cache players list
let players = [];
try {
    players = loadPlayers();
    console.log(`Loaded ${players.length} players from CSV`);
} catch (err) {
    console.error('Error loading players.csv:', err.message);
}

// ========================================
// REST API Endpoints
// ========================================

// Get all players
app.get('/api/players', (req, res) => {
    res.json(players);
});

// ========================================
// Authentication Routes
// ========================================

// Check if auth is configured
app.get('/auth/status', (req, res) => {
    res.json({ configured: isAuthConfigured() });
});

// Get current user
app.get('/auth/user', (req, res) => {
    res.json(req.user || null);
});

// Google OAuth login
app.get('/auth/google', (req, res, next) => {
    if (!isAuthConfigured()) {
        return res.status(503).json({ error: 'Google OAuth is not configured' });
    }
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// Google OAuth callback
app.get('/auth/google/callback',
    (req, res, next) => {
        if (!isAuthConfigured()) {
            return res.redirect('/');
        }
        passport.authenticate('google', { failureRedirect: '/' })(req, res, next);
    },
    (req, res) => {
        res.redirect('/');
    }
);

// Logout
app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

// Middleware: require auth only if auth is configured
function requireAuthIfConfigured(req, res, next) {
    if (!isAuthConfigured()) {
        return next(); // No auth configured, allow all
    }
    return requireAuth(req, res, next);
}

// ========================================
// Tournament API Endpoints
// ========================================

// Get tournament state
app.get('/api/tournament', (req, res) => {
    try {
        const state = db.getTournament();
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create/Update tournament (teams, generate schedule) - PROTECTED
app.post('/api/tournament', requireAuthIfConfigured, (req, res) => {
    try {
        const state = db.saveTournament(req.body);
        // Broadcast to all connected clients
        io.emit('tournament:updated', state);
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a group match score - PROTECTED
app.put('/api/match/:id', requireAuthIfConfigured, (req, res) => {
    try {
        const matchId = req.params.id;
        const state = db.updateMatch(matchId, req.body);
        // Broadcast to all connected clients
        io.emit('tournament:updated', state);
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a knockout match score - PROTECTED
app.put('/api/knockout/:key', requireAuthIfConfigured, (req, res) => {
    try {
        const matchKey = req.params.key;
        const state = db.updateKnockoutMatch(matchKey, req.body);
        // Broadcast to all connected clients
        io.emit('tournament:updated', state);
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset tournament - PROTECTED
app.delete('/api/tournament', requireAuthIfConfigured, (req, res) => {
    try {
        const state = db.resetTournament();
        // Broadcast to all connected clients
        io.emit('tournament:updated', state);
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// WebSocket Events
// ========================================
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send current state to newly connected client
    socket.emit('tournament:updated', db.getTournament());

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// ========================================
// Start Server
// ========================================
httpServer.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║     🏸 Badminton Showdown Server 🏸     ║
╠════════════════════════════════════════╣
║  Server running at:                    ║
║  http://localhost:${PORT}                  ║
╚════════════════════════════════════════╝
    `);
});
