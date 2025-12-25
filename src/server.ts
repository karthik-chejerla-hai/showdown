import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import session from 'express-session';

import * as db from './db';
import { passport, requireAuth, isAuthConfigured } from './auth';
import { TournamentState } from './types';

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

// Serve static files from public directory and root
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.static(path.join(__dirname, '..')));

// Load players from CSV
function loadPlayers(): string[] {
    const csvPath = path.join(__dirname, '..', 'players.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
        skip_empty_lines: true,
        trim: true
    }) as string[][];
    // CSV has single column with player names
    return records.map(row => row[0]).filter(name => name && name.trim());
}

// Cache players list
let players: string[] = [];
try {
    players = loadPlayers();
    console.log(`Loaded ${players.length} players from CSV`);
} catch (err) {
    console.error('Error loading players.csv:', (err as Error).message);
}

// ========================================
// REST API Endpoints
// ========================================

// Get all players
app.get('/api/players', (req: Request, res: Response) => {
    res.json(players);
});

// ========================================
// Authentication Routes
// ========================================

// Check if auth is configured
app.get('/auth/status', (req: Request, res: Response) => {
    res.json({ configured: isAuthConfigured() });
});

// Get current user
app.get('/auth/user', (req: Request, res: Response) => {
    res.json(req.user || null);
});

// Google OAuth login
app.get('/auth/google', (req: Request, res: Response, next: NextFunction) => {
    if (!isAuthConfigured()) {
        res.status(503).json({ error: 'Google OAuth is not configured' });
        return;
    }
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// Google OAuth callback
app.get('/auth/google/callback',
    (req: Request, res: Response, next: NextFunction) => {
        if (!isAuthConfigured()) {
            res.redirect('/');
            return;
        }
        passport.authenticate('google', { failureRedirect: '/' })(req, res, next);
    },
    (req: Request, res: Response) => {
        res.redirect('/');
    }
);

// Logout
app.get('/auth/logout', (req: Request, res: Response) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

// Middleware: require auth only if auth is configured
function requireAuthIfConfigured(req: Request, res: Response, next: NextFunction): void {
    if (!isAuthConfigured()) {
        return next(); // No auth configured, allow all
    }
    return requireAuth(req, res, next);
}

// ========================================
// Tournament API Endpoints
// ========================================

// Get tournament state
app.get('/api/tournament', (req: Request, res: Response) => {
    try {
        const state = db.getTournament();
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Create/Update tournament (teams, generate schedule) - PROTECTED
app.post('/api/tournament', requireAuthIfConfigured, (req: Request, res: Response) => {
    try {
        const state = db.saveTournament(req.body as TournamentState);
        // Broadcast to all connected clients
        io.emit('tournament:updated', state);
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Update a group match score - PROTECTED
app.put('/api/match/:id', requireAuthIfConfigured, (req: Request, res: Response) => {
    try {
        const matchId = req.params.id;
        const state = db.updateMatch(matchId, req.body);
        // Broadcast to all connected clients
        io.emit('tournament:updated', state);
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Update a knockout match score - PROTECTED
app.put('/api/knockout/:key', requireAuthIfConfigured, (req: Request, res: Response) => {
    try {
        const matchKey = req.params.key as keyof TournamentState['knockoutMatches'];
        const state = db.updateKnockoutMatch(matchKey, req.body);
        // Broadcast to all connected clients
        io.emit('tournament:updated', state);
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Reset tournament - PROTECTED
app.delete('/api/tournament', requireAuthIfConfigured, (req: Request, res: Response) => {
    try {
        const state = db.resetTournament();
        // Broadcast to all connected clients
        io.emit('tournament:updated', state);
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
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
