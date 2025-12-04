const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

const db = require('./db');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
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

// Get tournament state
app.get('/api/tournament', (req, res) => {
    try {
        const state = db.getTournament();
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create/Update tournament (teams, generate schedule)
app.post('/api/tournament', (req, res) => {
    try {
        const state = db.saveTournament(req.body);
        // Broadcast to all connected clients
        io.emit('tournament:updated', state);
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a group match score
app.put('/api/match/:id', (req, res) => {
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

// Update a knockout match score
app.put('/api/knockout/:key', (req, res) => {
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

// Reset tournament
app.delete('/api/tournament', (req, res) => {
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
