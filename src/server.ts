import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import session from 'express-session';

import * as db from './db';
import { passport, requireAuth, isAuthConfigured, requireAuthRedirect } from './auth';
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

// Serve static files (CSS, JS, etc.) - these don't need auth
app.use('/styles.css', express.static(path.join(__dirname, '..', 'public', 'styles.css')));
app.use('/app.js', express.static(path.join(__dirname, '..', 'public', 'app.js')));
app.use('/app.js.map', express.static(path.join(__dirname, '..', 'public', 'app.js.map')));

// Login page (no auth required)
app.get('/login', (req: Request, res: Response) => {
    // If already authenticated, redirect to main app
    if (req.isAuthenticated()) {
        res.redirect('/');
        return;
    }
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Badminton Showdown</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/styles.css">
    <style>
        .login-container {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: var(--bg-primary);
            padding: 2rem;
        }
        .login-card {
            background: var(--bg-secondary);
            border-radius: 16px;
            padding: 3rem;
            text-align: center;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
        }
        .login-logo {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        .login-title {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 2rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 0.5rem;
        }
        .login-subtitle {
            color: var(--text-secondary);
            margin-bottom: 2rem;
        }
        .btn-google-large {
            display: inline-flex;
            align-items: center;
            gap: 0.75rem;
            padding: 1rem 2rem;
            background: white;
            color: #333;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            text-decoration: none;
        }
        .btn-google-large:hover {
            background: #f8f9fa;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .google-icon {
            width: 20px;
            height: 20px;
        }
        .auth-error {
            background: var(--danger-bg);
            color: var(--danger);
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-card">
            <div class="login-logo">🏸</div>
            <h1 class="login-title">Badminton Showdown</h1>
            <p class="login-subtitle">Sign in to manage tournaments</p>
            ${!isAuthConfigured() ? '<div class="auth-error">Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.</div>' : ''}
            <a href="/auth/google" class="btn-google-large" ${!isAuthConfigured() ? 'style="pointer-events: none; opacity: 0.5;"' : ''}>
                <svg class="google-icon" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
            </a>
        </div>
    </div>
</body>
</html>
    `);
});

// Main app page (requires authentication)
app.get('/', requireAuthRedirect, (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

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

// Get all players - PROTECTED
app.get('/api/players', requireAuth, (req: Request, res: Response) => {
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


// ========================================
// Tournament API Endpoints
// ========================================

// Get tournament state - PROTECTED
app.get('/api/tournament', requireAuth, async (req: Request, res: Response) => {
    try {
        const state = await db.getTournament();
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Create/Update tournament (teams, generate schedule) - PROTECTED
app.post('/api/tournament', requireAuth, async (req: Request, res: Response) => {
    try {
        const state = await db.saveTournament(req.body as TournamentState);
        // Broadcast to all connected clients
        io.emit('tournament:updated', state);
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Update a group match score - PROTECTED
app.put('/api/match/:id', requireAuth, async (req: Request, res: Response) => {
    try {
        const matchId = req.params.id;
        const state = await db.updateMatch(matchId, req.body);
        // Broadcast to all connected clients
        io.emit('tournament:updated', state);
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Update a knockout match score - PROTECTED
app.put('/api/knockout/:key', requireAuth, async (req: Request, res: Response) => {
    try {
        const matchKey = req.params.key as keyof TournamentState['knockoutMatches'];
        const state = await db.updateKnockoutMatch(matchKey, req.body);
        // Broadcast to all connected clients
        io.emit('tournament:updated', state);
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Reset tournament - PROTECTED
app.delete('/api/tournament', requireAuth, async (req: Request, res: Response) => {
    try {
        const state = await db.resetTournament();
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
io.on('connection', async (socket) => {
    console.log('Client connected:', socket.id);

    // Send current state to newly connected client
    const state = await db.getTournament();
    socket.emit('tournament:updated', state);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// ========================================
// Start Server
// ========================================
async function startServer() {
    // Initialize database
    await db.initDatabase();
    console.log('Database initialized');

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
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
