// ========================================
// Badminton Tournament App
// ========================================

// Declare Socket.io types (loaded from CDN)
declare const io: () => Socket;

interface Socket {
    on(event: string, callback: (data?: unknown) => void): void;
    emit(event: string, data?: unknown): void;
    id: string;
}

// Type definitions
interface Team {
    id: string;
    name: string;
    players: string[];
}

interface Teams {
    A: Team[];
    B: Team[];
}

interface Game {
    id: number;
    team1Players: string[];
    team2Players: string[];
    team1Score: number | null;
    team2Score: number | null;
    winner: 'team1' | 'team2' | null;
}

interface Match {
    id: string;
    pool: 'A' | 'B';
    team1Id: string;
    team2Id: string;
    team1Name: string;
    team2Name: string;
    games: Game[];
    team1GamesWon: number;
    team2GamesWon: number;
    winner: string | null;
    completed: boolean;
}

interface KnockoutMatch {
    id: string;
    seed1: string;
    seed2: string;
    team1: Team | null;
    team2: Team | null;
    games: Game[];
    team1GamesWon: number;
    team2GamesWon: number;
    winner: string | null;
    completed: boolean;
}

interface KnockoutMatches {
    semi1: KnockoutMatch | null;
    semi2: KnockoutMatch | null;
    final: KnockoutMatch | null;
}

interface User {
    id: string;
    name: string;
    email?: string;
    photo?: string;
}

interface TournamentState {
    teams: Teams;
    matches: Match[];
    knockoutMatches: KnockoutMatches;
    scheduleGenerated: boolean;
}

interface AppState extends TournamentState {
    players: string[];
    currentUser: User | null;
    authConfigured: boolean;
}

interface Standing {
    id: string;
    name: string;
    played: number;
    matchesWon: number;
    matchesLost: number;
    gamesWon: number;
    gamesLost: number;
    points: number;
}

// State Management
const state: AppState = {
    players: [], // Available players from CSV
    teams: {
        A: [
            { id: 'A1', name: 'Team 1', players: ['', '', ''] },
            { id: 'A2', name: 'Team 2', players: ['', '', ''] },
            { id: 'A3', name: 'Team 3', players: ['', '', ''] }
        ],
        B: [
            { id: 'B1', name: 'Team 4', players: ['', '', ''] },
            { id: 'B2', name: 'Team 5', players: ['', '', ''] },
            { id: 'B3', name: 'Team 6', players: ['', '', ''] }
        ]
    },
    matches: [],
    knockoutMatches: {
        semi1: null,
        semi2: null,
        final: null
    },
    scheduleGenerated: false,
    currentUser: null,
    authConfigured: false
};

// Socket.io connection
let socket: Socket | null = null;

// Flag to track pending saves (prevents double render from own WebSocket echo)
let pendingSave = false;

// DOM Elements
const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('.nav-link');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
const scoreModal = document.getElementById('score-modal') as HTMLDivElement;
const modalClose = document.getElementById('modal-close') as HTMLButtonElement;
const modalCancel = document.getElementById('modal-cancel') as HTMLButtonElement;
const modalSave = document.getElementById('modal-save') as HTMLButtonElement;

// Current match being edited
let currentEditMatch: Match | KnockoutMatch | null = null;
let currentEditType: 'group' | 'knockout' | null = null;

// ========================================
// Initialize App
// ========================================
async function init(): Promise<void> {
    createToastContainer();
    addConnectionIndicator();
    setupNavigation();
    setupEventListeners();

    // Check auth status first
    await checkAuthStatus();

    // Load players from server
    await loadPlayers();

    // Connect to WebSocket
    connectSocket();
}

// ========================================
// Authentication
// ========================================
async function checkAuthStatus(): Promise<void> {
    try {
        // Check if auth is configured
        const statusRes = await fetch('/auth/status');
        const { configured } = await statusRes.json();
        state.authConfigured = configured;

        // Get current user if auth is configured
        if (configured) {
            const userRes = await fetch('/auth/user');
            state.currentUser = await userRes.json();
        }

        renderAuthUI();
    } catch (err) {
        console.error('Failed to check auth status:', err);
    }
}

function renderAuthUI(): void {
    const authContainer = document.getElementById('auth-container');
    if (!authContainer) return;

    if (!state.authConfigured) {
        // Auth not configured, hide the auth container
        authContainer.style.display = 'none';
        return;
    }

    authContainer.style.display = 'flex';

    if (state.currentUser) {
        authContainer.innerHTML = `
            <div class="user-info">
                ${state.currentUser.photo ? `<img src="${state.currentUser.photo}" alt="${state.currentUser.name}" class="user-avatar">` : ''}
                <span class="user-name">${state.currentUser.name}</span>
            </div>
            <a href="/auth/logout" class="btn btn-secondary btn-sm">Logout</a>
        `;
    } else {
        authContainer.innerHTML = `
            <a href="/auth/google" class="btn btn-google">
                <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
            </a>
        `;
    }

    updateEditPermissions();
}

function canEdit(): boolean {
    // If auth is not configured, everyone can edit
    if (!state.authConfigured) return true;
    // If auth is configured, only logged-in users can edit
    return !!state.currentUser;
}

function updateEditPermissions(): void {
    const canEditNow = canEdit();

    // Update buttons
    document.querySelectorAll('.requires-auth').forEach(el => {
        const element = el as HTMLButtonElement;
        if (canEditNow) {
            element.disabled = false;
            element.classList.remove('disabled');
            element.title = '';
        } else {
            element.disabled = true;
            element.classList.add('disabled');
            element.title = 'Login required to edit';
        }
    });

    // Show login hint if needed
    const loginHint = document.getElementById('login-hint');
    if (loginHint) {
        loginHint.style.display = (state.authConfigured && !state.currentUser) ? 'block' : 'none';
    }
}

// ========================================
// Toast Notifications
// ========================================
function createToastContainer(): void {
    const container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toast-container';
    document.body.appendChild(container);
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons: Record<string, string> = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========================================
// Connection Status Indicator
// ========================================
function addConnectionIndicator(): void {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    const indicator = document.createElement('div');
    indicator.className = 'connection-status connecting';
    indicator.id = 'connection-status';
    indicator.innerHTML = `
        <span class="connection-dot"></span>
        <span>Connecting...</span>
    `;
    const mobileMenuBtn = navbar.querySelector('.mobile-menu-btn');
    if (mobileMenuBtn) {
        navbar.insertBefore(indicator, mobileMenuBtn);
    }
}

function updateConnectionStatus(status: 'connected' | 'disconnected' | 'connecting'): void {
    const indicator = document.getElementById('connection-status');
    if (!indicator) return;

    indicator.className = `connection-status ${status}`;
    const text: Record<string, string> = {
        connected: 'Live',
        disconnected: 'Offline',
        connecting: 'Connecting...'
    };
    indicator.innerHTML = `
        <span class="connection-dot"></span>
        <span>${text[status]}</span>
    `;
}

// ========================================
// Socket.io Connection
// ========================================
function connectSocket(): void {
    socket = io();

    socket.on('connect', () => {
        updateConnectionStatus('connected');
        console.log('Connected to server');
    });

    socket.on('disconnect', () => {
        updateConnectionStatus('disconnected');
        console.log('Disconnected from server');
    });

    socket.on('tournament:updated', (data: unknown) => {
        const newState = data as TournamentState;
        console.log('Received tournament update');
        // Update local state
        state.teams = newState.teams;
        state.matches = newState.matches;
        state.knockoutMatches = newState.knockoutMatches;
        state.scheduleGenerated = newState.scheduleGenerated;

        // Skip re-render if this update is from our own save
        if (pendingSave) {
            console.log('Skipping re-render (own update)');
            return;
        }

        // Re-render all views (only for updates from other clients)
        renderTeamForms();
        if (state.scheduleGenerated) {
            renderSchedule();
            renderStandings();
            renderKnockout();
        }
    });
}

// ========================================
// API Helpers
// ========================================
async function loadPlayers(): Promise<void> {
    try {
        const response = await fetch('/api/players');
        state.players = await response.json();
        console.log(`Loaded ${state.players.length} players`);
        renderTeamForms();
    } catch (err) {
        console.error('Failed to load players:', err);
        showToast('Failed to load players', 'error');
    }
}

async function _fetchTournament(): Promise<void> {
    try {
        const response = await fetch('/api/tournament');
        const data: TournamentState = await response.json();
        Object.assign(state, {
            teams: data.teams,
            matches: data.matches,
            knockoutMatches: data.knockoutMatches,
            scheduleGenerated: data.scheduleGenerated
        });
        renderTeamForms();
        if (state.scheduleGenerated) {
            renderSchedule();
            renderStandings();
            renderKnockout();
        }
    } catch (err) {
        console.error('Failed to fetch tournament:', err);
        showToast('Failed to load tournament data', 'error');
    }
}

async function saveTournament(): Promise<TournamentState> {
    try {
        const response = await fetch('/api/tournament', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teams: state.teams,
                matches: state.matches,
                knockoutMatches: state.knockoutMatches,
                scheduleGenerated: state.scheduleGenerated
            })
        });
        if (response.status === 401) {
            showToast('Please login to make changes', 'error');
            throw new Error('Unauthorized');
        }
        return await response.json();
    } catch (err) {
        console.error('Failed to save tournament:', err);
        if ((err as Error).message !== 'Unauthorized') {
            showToast('Failed to save changes', 'error');
        }
        throw err;
    }
}

async function updateMatchOnServer(matchId: string, matchData: Match): Promise<TournamentState> {
    try {
        const response = await fetch(`/api/match/${encodeURIComponent(matchId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(matchData)
        });
        if (response.status === 401) {
            showToast('Please login to make changes', 'error');
            throw new Error('Unauthorized');
        }
        return await response.json();
    } catch (err) {
        console.error('Failed to update match:', err);
        if ((err as Error).message !== 'Unauthorized') {
            showToast('Failed to save score', 'error');
        }
        throw err;
    }
}

async function _updateKnockoutOnServer(matchKey: string, matchData: KnockoutMatch): Promise<TournamentState> {
    try {
        const response = await fetch(`/api/knockout/${matchKey}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(matchData)
        });
        if (response.status === 401) {
            showToast('Please login to make changes', 'error');
            throw new Error('Unauthorized');
        }
        return await response.json();
    } catch (err) {
        console.error('Failed to update knockout match:', err);
        if ((err as Error).message !== 'Unauthorized') {
            showToast('Failed to save score', 'error');
        }
        throw err;
    }
}

async function resetTournamentOnServer(): Promise<TournamentState> {
    try {
        const response = await fetch('/api/tournament', { method: 'DELETE' });
        if (response.status === 401) {
            showToast('Please login to make changes', 'error');
            throw new Error('Unauthorized');
        }
        return await response.json();
    } catch (err) {
        console.error('Failed to reset tournament:', err);
        if ((err as Error).message !== 'Unauthorized') {
            showToast('Failed to reset tournament', 'error');
        }
        throw err;
    }
}

// ========================================
// Navigation
// ========================================
function setupNavigation(): void {
    [...navLinks, ...mobileNavLinks].forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = (link as HTMLElement).dataset.section;
            if (sectionId) {
                showSection(sectionId);
            }
        });
    });
}

function showSection(sectionId: string): void {
    sections.forEach(section => {
        section.classList.remove('active');
    });
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    navLinks.forEach(link => {
        link.classList.toggle('active', (link as HTMLElement).dataset.section === sectionId);
    });

    mobileNavLinks.forEach(link => {
        link.classList.toggle('active', (link as HTMLElement).dataset.section === sectionId);
    });
}

// ========================================
// Get Selected Players (for validation)
// ========================================
function getSelectedPlayers(): Set<string> {
    const selected = new Set<string>();
    (['A', 'B'] as const).forEach(pool => {
        state.teams[pool].forEach(team => {
            team.players.forEach(player => {
                if (player) selected.add(player);
            });
        });
    });
    return selected;
}

// Update dropdown options in-place without full re-render
function updatePlayerDropdownOptions(): void {
    const selectedPlayers = getSelectedPlayers();
    document.querySelectorAll('.player-select').forEach(select => {
        const selectEl = select as HTMLSelectElement;
        const currentValue = selectEl.value;
        // Rebuild options: only show unassigned players + currently selected
        const availablePlayers = state.players.filter(p => p === currentValue || !selectedPlayers.has(p));

        // Keep the placeholder option, rebuild the rest
        selectEl.innerHTML = `<option value="">Select player...</option>` +
            availablePlayers.map(p =>
                `<option value="${p}" ${p === currentValue ? 'selected' : ''}>${p}</option>`
            ).join('');
    });
}

// ========================================
// Team Forms with Dropdowns
// ========================================
function renderTeamForms(): void {
    renderPoolTeams('A', 'pool-a-teams');
    renderPoolTeams('B', 'pool-b-teams');
}

function renderPoolTeams(pool: 'A' | 'B', containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    const teams = state.teams[pool];
    const selectedPlayers = getSelectedPlayers();
    const isDisabled = state.scheduleGenerated || !canEdit();

    container.innerHTML = teams.map((team, index) => `
        <div class="team-card" data-team="${team.id}">
            <div class="team-card-header">
                <div class="team-number">
                    <span class="team-badge">${index + 1}</span>
                    <input type="text"
                           class="team-name-input"
                           placeholder="Team Name"
                           value="${team.name}"
                           data-pool="${pool}"
                           data-index="${index}"
                           data-field="name"
                           ${isDisabled ? 'disabled' : ''}>
                </div>
            </div>
            <div class="players-list">
                ${team.players.map((player, pIndex) => `
                    <div class="player-input-group">
                        <span class="player-number">${pIndex + 1}</span>
                        <select class="player-select ${player ? 'selected' : ''}"
                                data-pool="${pool}"
                                data-index="${index}"
                                data-player="${pIndex}"
                                ${isDisabled ? 'disabled' : ''}>
                            <option value="">Select player...</option>
                            ${state.players
                                .filter(p => p === player || !selectedPlayers.has(p))
                                .map(p => `<option value="${p}" ${player === p ? 'selected' : ''}>${p}</option>`)
                                .join('')}
                        </select>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// ========================================
// Event Listeners
// ========================================
function setupEventListeners(): void {
    // Team name input changes
    document.addEventListener('input', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('team-name-input')) {
            const input = target as HTMLInputElement;
            const pool = input.dataset.pool as 'A' | 'B';
            const index = parseInt(input.dataset.index || '0', 10);
            state.teams[pool][index].name = input.value;
            // Debounced save
            debouncedSave();
        }
    });

    // Player select changes
    document.addEventListener('change', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('player-select')) {
            const select = target as HTMLSelectElement;
            const pool = select.dataset.pool as 'A' | 'B';
            const index = parseInt(select.dataset.index || '0', 10);
            const playerIndex = parseInt(select.dataset.player || '0', 10);
            state.teams[pool][index].players[playerIndex] = select.value;

            // Update visual state
            if (select.value) {
                select.classList.add('selected');
            } else {
                select.classList.remove('selected');
            }

            // Update other dropdowns' disabled options (without full re-render)
            updatePlayerDropdownOptions();

            // Save to server
            debouncedSave();
        }
    });

    // Generate schedule button
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', generateSchedule);
    }

    // Reset button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetTournament);
    }

    // Schedule tabs
    document.querySelectorAll('.schedule-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.schedule-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            filterMatches((tab as HTMLElement).dataset.pool || 'all');
        });
    });

    // Modal events
    modalClose.addEventListener('click', closeModal);
    modalCancel.addEventListener('click', closeModal);
    modalSave.addEventListener('click', saveScore);
    scoreModal.addEventListener('click', (e) => {
        if (e.target === scoreModal) closeModal();
    });

    // Keyboard escape to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && scoreModal.classList.contains('active')) {
            closeModal();
        }
    });
}

// Debounce helper
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(): void {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        pendingSave = true;
        await saveTournament();
        // Small delay to allow WebSocket message to arrive before clearing flag
        setTimeout(() => { pendingSave = false; }, 100);
    }, 500);
}

// ========================================
// Schedule Generation
// ========================================
async function generateSchedule(): Promise<void> {
    // Validate all teams have names and players
    const allTeams = [...state.teams.A, ...state.teams.B];

    for (const team of allTeams) {
        if (!team.name.trim()) {
            showToast('Please enter names for all teams', 'error');
            return;
        }
        for (const player of team.players) {
            if (!player.trim()) {
                showToast(`Please select all players for team "${team.name || team.id}"`, 'error');
                return;
            }
        }
    }

    // Check for duplicate players
    const allPlayers = allTeams.flatMap(t => t.players);
    const uniquePlayers = new Set(allPlayers);
    if (uniquePlayers.size !== allPlayers.length) {
        showToast('Each player can only be on one team', 'error');
        return;
    }

    // Generate group stage matches
    state.matches = [];

    // Pool A matches (team 1 vs 2, 1 vs 3, 2 vs 3)
    generatePoolMatches('A');

    // Pool B matches
    generatePoolMatches('B');

    // Initialize knockout matches
    state.knockoutMatches = {
        semi1: createKnockoutMatch('semi1', 'A1', 'B2'),
        semi2: createKnockoutMatch('semi2', 'B1', 'A2'),
        final: createKnockoutMatch('final', 'W1', 'W2')
    };

    state.scheduleGenerated = true;

    try {
        await saveTournament();
        showToast('Schedule generated successfully!', 'success');
        showSection('schedule');
    } catch {
        // Revert on error
        state.matches = [];
        state.knockoutMatches = { semi1: null, semi2: null, final: null };
        state.scheduleGenerated = false;
    }
}

function generatePoolMatches(pool: 'A' | 'B'): void {
    const teams = state.teams[pool];
    const matchups: [number, number][] = [
        [0, 1],
        [0, 2],
        [1, 2]
    ];

    matchups.forEach(([i, j]) => {
        const team1 = teams[i];
        const team2 = teams[j];

        // Generate 3 doubles matches
        // Each player pairs with each other player exactly once
        // Player combinations: (0,1), (0,2), (1,2)
        const pairings = [
            { team1Pair: [0, 1], team2Pair: [0, 1] },
            { team1Pair: [0, 2], team2Pair: [0, 2] },
            { team1Pair: [1, 2], team2Pair: [1, 2] }
        ];

        const match: Match = {
            id: `${pool}-${team1.id}-${team2.id}`,
            pool,
            team1Id: team1.id,
            team2Id: team2.id,
            team1Name: team1.name,
            team2Name: team2.name,
            games: pairings.map((pairing, gameIndex) => ({
                id: gameIndex,
                team1Players: pairing.team1Pair.map(p => team1.players[p]),
                team2Players: pairing.team2Pair.map(p => team2.players[p]),
                team1Score: null,
                team2Score: null,
                winner: null
            })),
            team1GamesWon: 0,
            team2GamesWon: 0,
            winner: null,
            completed: false
        };

        state.matches.push(match);
    });
}

function createKnockoutMatch(id: string, seed1: string, seed2: string): KnockoutMatch {
    return {
        id,
        seed1,
        seed2,
        team1: null,
        team2: null,
        games: [],
        team1GamesWon: 0,
        team2GamesWon: 0,
        winner: null,
        completed: false
    };
}

// ========================================
// Schedule Rendering
// ========================================
function renderSchedule(): void {
    const container = document.getElementById('matches-container');
    if (!container) return;

    if (!state.scheduleGenerated || state.matches.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📋</span>
                <p>Generate the schedule from the Setup page first</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.matches.map((match, index) => renderMatchCard(match, index)).join('');
}

function renderMatchCard(match: Match, index: number): string {
    const team1Class = match.winner === match.team1Id ? 'winner' : '';
    const team2Class = match.winner === match.team2Id ? 'winner' : '';

    return `
        <div class="match-card" data-match="${match.id}" data-pool="${match.pool}">
            <div class="match-header">
                <div class="match-info">
                    <span class="match-number">Match ${index + 1}</span>
                    <span class="pool-badge pool-${match.pool.toLowerCase()}">Pool ${match.pool}</span>
                </div>
                <span class="match-status ${match.completed ? 'completed' : 'pending'}">
                    ${match.completed ? 'Completed' : 'Pending'}
                </span>
            </div>
            <div class="match-teams">
                <div class="match-team ${team1Class}">
                    <div class="match-team-name">${match.team1Name}</div>
                    <div class="match-team-score">${match.completed ? match.team1GamesWon : '-'}</div>
                </div>
                <span class="match-vs">VS</span>
                <div class="match-team ${team2Class}">
                    <div class="match-team-name">${match.team2Name}</div>
                    <div class="match-team-score">${match.completed ? match.team2GamesWon : '-'}</div>
                </div>
            </div>
            <div class="match-games">
                <div class="match-games-title">Doubles Matches</div>
                <div class="games-list">
                    ${match.games.map((game, gIndex) => renderGameRow(game, gIndex, match)).join('')}
                </div>
            </div>
            <div class="match-actions">
                <button class="btn btn-primary btn-sm" onclick="openScoreModal('${match.id}')">
                    ${match.completed ? 'Edit Score' : 'Enter Score'}
                </button>
            </div>
        </div>
    `;
}

// Helper: Check if score1 beats score2 per badminton rules (BWF Standard)
// - First to 21 wins
// - At 20-20 deuce: need 2-point lead
// - Cap at 30: at 29-29, first to 30 wins
function isGameWinner(score1: number, score2: number): boolean {
    if (score1 <= score2) return false;
    // Cap at 30: if score1 reaches 30, they win
    if (score1 === 30) return true;
    // Normal win: reach 21 with opponent below 20
    if (score1 >= 21 && score2 < 20) return true;
    // Deuce win: 2-point lead after 20-all
    if (score1 >= 21 && score2 >= 20 && score1 - score2 >= 2) return true;
    return false;
}

function renderGameRow(game: Game, _index: number, _match: Match): string {
    const hasScore = game.team1Score !== null && game.team2Score !== null;

    // Use proper badminton win detection
    let team1Won = false;
    let team2Won = false;
    if (hasScore) {
        team1Won = isGameWinner(game.team1Score!, game.team2Score!);
        team2Won = isGameWinner(game.team2Score!, game.team1Score!);
    }

    return `
        <div class="game-row">
            <div class="game-team1-players ${team1Won ? 'winner' : ''}">
                ${game.team1Players.join(' & ')}
            </div>
            <div class="game-vs-container">
                ${team1Won ? '<span class="winner-shuttle">🏸</span>' : '<span class="winner-shuttle-placeholder"></span>'}
                <span class="game-vs">vs</span>
                ${team2Won ? '<span class="winner-shuttle">🏸</span>' : '<span class="winner-shuttle-placeholder"></span>'}
            </div>
            <div class="game-team2-players ${team2Won ? 'winner' : ''}">
                ${game.team2Players.join(' & ')}
            </div>
            <div class="game-score">${hasScore ? `${game.team1Score} - ${game.team2Score}` : '-'}</div>
        </div>
    `;
}

function filterMatches(pool: string): void {
    const cards = document.querySelectorAll('.match-card');
    cards.forEach(card => {
        const cardEl = card as HTMLElement;
        if (pool === 'all' || cardEl.dataset.pool === pool) {
            cardEl.style.display = 'block';
        } else {
            cardEl.style.display = 'none';
        }
    });
}

// ========================================
// Score Modal
// ========================================
function openScoreModal(matchId: string): void {
    if (!canEdit()) {
        showToast('Please login to enter scores', 'info');
        return;
    }

    const match = state.matches.find(m => m.id === matchId);
    if (!match) return;

    currentEditMatch = match;
    currentEditType = 'group';

    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) {
        modalTitle.textContent = `${match.team1Name} vs ${match.team2Name}`;
    }

    const modalBody = document.getElementById('modal-body');
    if (modalBody) {
        modalBody.innerHTML = match.games.map((game, index) => `
            <div class="score-input-group">
                <div class="score-input-header">
                    <h3>Game ${index + 1}</h3>
                </div>
                <div class="score-pair">
                    <div class="score-pair-players">
                        <div>${game.team1Players.join(' & ')}</div>
                        <div class="score-pair-vs">vs</div>
                        <div>${game.team2Players.join(' & ')}</div>
                    </div>
                    <div class="score-inputs">
                        <input type="number"
                               class="score-input"
                               id="game-${index}-score1"
                               min="0"
                               max="30"
                               value="${game.team1Score !== null ? game.team1Score : ''}"
                               placeholder="0">
                        <span class="score-separator">-</span>
                        <input type="number"
                               class="score-input"
                               id="game-${index}-score2"
                               min="0"
                               max="30"
                               value="${game.team2Score !== null ? game.team2Score : ''}"
                               placeholder="0">
                    </div>
                </div>
            </div>
        `).join('');
    }

    scoreModal.classList.add('active');
}

function openKnockoutScoreModal(matchKey: string): void {
    if (!canEdit()) {
        showToast('Please login to enter scores', 'info');
        return;
    }

    const match = state.knockoutMatches[matchKey as keyof KnockoutMatches];
    if (!match || !match.team1 || !match.team2) {
        showToast('Teams have not been determined yet', 'info');
        return;
    }

    currentEditMatch = match;
    currentEditType = 'knockout';

    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) {
        modalTitle.textContent = `${match.team1.name} vs ${match.team2.name}`;
    }

    // If games not initialized, create them
    if (match.games.length === 0) {
        initializeKnockoutGames(match);
    }

    const modalBody = document.getElementById('modal-body');
    if (modalBody) {
        modalBody.innerHTML = match.games.map((game, index) => `
            <div class="score-input-group">
                <div class="score-input-header">
                    <h3>Game ${index + 1}</h3>
                </div>
                <div class="score-pair">
                    <div class="score-pair-players">
                        <div>${game.team1Players.join(' & ')}</div>
                        <div class="score-pair-vs">vs</div>
                        <div>${game.team2Players.join(' & ')}</div>
                    </div>
                    <div class="score-inputs">
                        <input type="number"
                               class="score-input"
                               id="game-${index}-score1"
                               min="0"
                               max="30"
                               value="${game.team1Score !== null ? game.team1Score : ''}"
                               placeholder="0">
                        <span class="score-separator">-</span>
                        <input type="number"
                               class="score-input"
                               id="game-${index}-score2"
                               min="0"
                               max="30"
                               value="${game.team2Score !== null ? game.team2Score : ''}"
                               placeholder="0">
                    </div>
                </div>
            </div>
        `).join('');
    }

    scoreModal.classList.add('active');
}

function initializeKnockoutGames(match: KnockoutMatch): void {
    if (!match.team1 || !match.team2) return;

    const pairings = [
        { team1Pair: [0, 1], team2Pair: [0, 1] },
        { team1Pair: [0, 2], team2Pair: [0, 2] },
        { team1Pair: [1, 2], team2Pair: [1, 2] }
    ];

    match.games = pairings.map((pairing, gameIndex) => ({
        id: gameIndex,
        team1Players: pairing.team1Pair.map(p => match.team1!.players[p]),
        team2Players: pairing.team2Pair.map(p => match.team2!.players[p]),
        team1Score: null,
        team2Score: null,
        winner: null
    }));
}

function closeModal(): void {
    scoreModal.classList.remove('active');
    currentEditMatch = null;
    currentEditType = null;
}

async function saveScore(): Promise<void> {
    if (!currentEditMatch) return;

    let allGamesScored = true;
    let team1Wins = 0;
    let team2Wins = 0;

    currentEditMatch.games.forEach((game, index) => {
        const score1Input = document.getElementById(`game-${index}-score1`) as HTMLInputElement;
        const score2Input = document.getElementById(`game-${index}-score2`) as HTMLInputElement;

        const score1 = score1Input.value !== '' ? parseInt(score1Input.value) : null;
        const score2 = score2Input.value !== '' ? parseInt(score2Input.value) : null;

        game.team1Score = score1;
        game.team2Score = score2;

        if (score1 !== null && score2 !== null) {
            // Use proper badminton win detection
            if (isGameWinner(score1, score2)) {
                game.winner = 'team1';
                team1Wins++;
            } else if (isGameWinner(score2, score1)) {
                game.winner = 'team2';
                team2Wins++;
            } else {
                // Game not yet decided (e.g., 20-20 with no 2-point lead)
                game.winner = null;
                allGamesScored = false;
            }
        } else {
            allGamesScored = false;
        }
    });

    currentEditMatch.team1GamesWon = team1Wins;
    currentEditMatch.team2GamesWon = team2Wins;
    currentEditMatch.completed = allGamesScored;

    if (allGamesScored) {
        if (team1Wins > team2Wins) {
            if (currentEditType === 'group') {
                currentEditMatch.winner = (currentEditMatch as Match).team1Id;
            } else {
                currentEditMatch.winner = (currentEditMatch as KnockoutMatch).team1!.id;
            }
        } else if (team2Wins > team1Wins) {
            if (currentEditType === 'group') {
                currentEditMatch.winner = (currentEditMatch as Match).team2Id;
            } else {
                currentEditMatch.winner = (currentEditMatch as KnockoutMatch).team2!.id;
            }
        }
    }

    try {
        if (currentEditType === 'group') {
            await updateMatchOnServer(currentEditMatch.id, currentEditMatch as Match);
        } else {
            // Update knockout progression before saving
            updateKnockoutProgression();
            await saveTournament();
        }
        showToast('Score saved!', 'success');
    } catch {
        showToast('Failed to save score', 'error');
    }

    closeModal();
}

// ========================================
// Standings
// ========================================
function renderStandings(): void {
    renderPoolStandings('A', 'standings-a');
    renderPoolStandings('B', 'standings-b');
}

function renderPoolStandings(pool: 'A' | 'B', tableId: string): void {
    const standings = calculateStandings(pool);

    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;

    tbody.innerHTML = standings.map((team, index) => `
        <tr>
            <td><span class="position-badge position-${index + 1}">${index + 1}</span></td>
            <td>${team.name}</td>
            <td>${team.played}</td>
            <td>${team.matchesWon}</td>
            <td>${team.matchesLost}</td>
            <td>${team.gamesWon}</td>
            <td>${team.gamesLost}</td>
            <td><strong>${team.points}</strong></td>
        </tr>
    `).join('');
}

function calculateStandings(pool: 'A' | 'B'): Standing[] {
    const teams = state.teams[pool];
    const poolMatches = state.matches.filter(m => m.pool === pool);

    const standings: Standing[] = teams.map(team => ({
        id: team.id,
        name: team.name,
        played: 0,
        matchesWon: 0,
        matchesLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        points: 0
    }));

    poolMatches.forEach(match => {
        if (!match.completed) return;

        const team1Standing = standings.find(s => s.id === match.team1Id);
        const team2Standing = standings.find(s => s.id === match.team2Id);

        if (team1Standing && team2Standing) {
            team1Standing.played++;
            team2Standing.played++;

            team1Standing.gamesWon += match.team1GamesWon;
            team1Standing.gamesLost += match.team2GamesWon;
            team2Standing.gamesWon += match.team2GamesWon;
            team2Standing.gamesLost += match.team1GamesWon;

            if (match.winner === match.team1Id) {
                team1Standing.matchesWon++;
                team1Standing.points += 2;
                team2Standing.matchesLost++;
            } else if (match.winner === match.team2Id) {
                team2Standing.matchesWon++;
                team2Standing.points += 2;
                team1Standing.matchesLost++;
            } else {
                // Draw (both get 1 point)
                team1Standing.points += 1;
                team2Standing.points += 1;
            }
        }
    });

    // Sort by points, then game difference
    standings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const aDiff = a.gamesWon - a.gamesLost;
        const bDiff = b.gamesWon - b.gamesLost;
        return bDiff - aDiff;
    });

    return standings;
}

// ========================================
// Knockout Stage
// ========================================
function renderKnockout(): void {
    updateKnockoutTeams();

    const { semi1, semi2, final: finalMatch } = state.knockoutMatches;

    // Semi 1 (A1 vs B2)
    renderBracketMatch('semi1', semi1);

    // Semi 2 (B1 vs A2)
    renderBracketMatch('semi2', semi2);

    // Final
    renderBracketMatch('final', finalMatch);

    // Show champion if final is complete
    const championDisplay = document.getElementById('champion-display');
    const championName = document.getElementById('champion-name');

    if (finalMatch && finalMatch.completed && finalMatch.winner && championDisplay && championName) {
        const champion = finalMatch.winner === finalMatch.team1!.id
            ? finalMatch.team1!.name
            : finalMatch.team2!.name;

        championName.textContent = champion;
        championDisplay.style.display = 'block';
    } else if (championDisplay) {
        championDisplay.style.display = 'none';
    }
}

function renderBracketMatch(matchKey: string, match: KnockoutMatch | null): void {
    const element = document.getElementById(matchKey);
    if (!element || !match) return;

    const team1Name = match.team1 ? match.team1.name : 'TBD';
    const team2Name = match.team2 ? match.team2.name : 'TBD';
    const team1Score = match.completed ? match.team1GamesWon : '-';
    const team2Score = match.completed ? match.team2GamesWon : '-';

    const team1Winner = match.completed && match.winner === (match.team1 ? match.team1.id : null);
    const team2Winner = match.completed && match.winner === (match.team2 ? match.team2.id : null);

    element.innerHTML = `
        <div class="bracket-team top ${team1Winner ? 'winner' : ''}">
            <span class="seed">${match.seed1}</span>
            <span class="team-name">${team1Name}</span>
            <span class="score">${team1Score}</span>
        </div>
        <div class="vs-badge">VS</div>
        <div class="bracket-team bottom ${team2Winner ? 'winner' : ''}">
            <span class="seed">${match.seed2}</span>
            <span class="team-name">${team2Name}</span>
            <span class="score">${team2Score}</span>
        </div>
    `;

    // Add click handler for scoring
    element.onclick = () => openKnockoutScoreModal(matchKey);
}

function updateKnockoutTeams(): void {
    if (!state.scheduleGenerated) return;

    const standingsA = calculateStandings('A');
    const standingsB = calculateStandings('B');

    // Get team data
    const getTeamData = (pool: 'A' | 'B', position: number): Team | null => {
        const standings = pool === 'A' ? standingsA : standingsB;
        if (standings[position - 1]) {
            const teamId = standings[position - 1].id;
            const poolData = state.teams[pool];
            return poolData.find(t => t.id === teamId) || null;
        }
        return null;
    };

    // Semi 1: A1 vs B2
    const a1 = getTeamData('A', 1);
    const b2 = getTeamData('B', 2);
    if (state.knockoutMatches.semi1) {
        state.knockoutMatches.semi1.team1 = a1;
        state.knockoutMatches.semi1.team2 = b2;
    }

    // Semi 2: B1 vs A2
    const b1 = getTeamData('B', 1);
    const a2 = getTeamData('A', 2);
    if (state.knockoutMatches.semi2) {
        state.knockoutMatches.semi2.team1 = b1;
        state.knockoutMatches.semi2.team2 = a2;
    }
}

function updateKnockoutProgression(): void {
    const { semi1, semi2, final: finalMatch } = state.knockoutMatches;

    if (!finalMatch) return;

    // Update final teams based on semifinal winners
    if (semi1 && semi1.completed && semi1.winner) {
        finalMatch.team1 = semi1.winner === semi1.team1!.id ? semi1.team1 : semi1.team2;
    }

    if (semi2 && semi2.completed && semi2.winner) {
        finalMatch.team2 = semi2.winner === semi2.team1!.id ? semi2.team1 : semi2.team2;
    }

    // Reset final games if teams change
    if (finalMatch.team1 && finalMatch.team2 && finalMatch.games.length === 0) {
        initializeKnockoutGames(finalMatch);
    }
}

// ========================================
// Reset Tournament
// ========================================
async function resetTournament(): Promise<void> {
    if (!confirm('Are you sure you want to reset the tournament? All data will be lost.')) {
        return;
    }

    try {
        await resetTournamentOnServer();
        showToast('Tournament reset successfully', 'success');
        showSection('setup');
    } catch {
        showToast('Failed to reset tournament', 'error');
    }
}

// Make functions globally available for onclick handlers
(window as unknown as { openScoreModal: typeof openScoreModal }).openScoreModal = openScoreModal;
(window as unknown as { openKnockoutScoreModal: typeof openKnockoutScoreModal }).openKnockoutScoreModal = openKnockoutScoreModal;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
