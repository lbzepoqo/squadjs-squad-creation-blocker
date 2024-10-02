import BasePlugin from './base-plugin.js';

export default class SquadCreationBlocker extends BasePlugin {
  static get description() {
    return 'The <code>SquadCreationBlocker</code> plugin prevents squads with custom names from being created within a specified time after a new game starts and at the end of a round. It can either broadcast countdown messages or send individual warnings to players attempting to create squads. The plugin also includes a rate limiter to prevent players from spamming custom squad names, which can be disabled via an option.';
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      blockDuration: {
        required: false,
        description: 'Time period after a new game starts during which custom squad creation is blocked (in seconds).',
        default: 15
      },
      broadcastMode: {
        required: false,
        description: 'If true, uses countdown broadcasts. If false, sends individual warnings to players.',
        default: false
      },
      allowDefaultSquadNames: {
        required: false,
        description: 'If true, allows creation of squads with default names (e.g., "Squad 1") during the blocking period.',
        default: true
      },
      rateLimitEnforced: {
        required: false,
        description: 'If true, enables rate limiting on custom squad creation. If false, rate limiting is disabled.',
        default: false
      },
      rateLimitWindow: {
        required: false,
        description: 'The time window (in seconds) within which a player can create a maximum number of custom squads before triggering the backoff.',
        default: 2
      },
      rateLimitMaxSquads: {
        required: false,
        description: 'The maximum number of custom squads a player can create within the rate limit window.',
        default: 3
      },
      rateLimitBackoffTime: {
        required: false,
        description: 'The time (in seconds) a player must wait after exceeding the rate limit before creating another custom squad.',
        default: 10
      },
      maxSquadsInTimeWindow: {
        required: false,
        description: 'Maximum number of squads a player can create within the defined time window before being kicked.',
        default: 10
      },
      timeWindowForKick: {
          required: false,
          description: 'Time window (in seconds) during which squad creation will be tracked for kicking players.',
          default: 5
      },
      enforceMaxSquadCreationKick: {
        required: false,
        description: 'If true, players exceeding the max squads in time window will be kicked. If false, kicking is disabled.',
        default: false
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.isBlocking = false;
    this.isRoundEnding = false;
    this.blockDurationMs = this.options.blockDuration * 1000;
    this.blockEndTime = 0;
    this.broadcastTimeouts = [];
    this.bindEventHandlers();
    this.squadCreationType = this.options.allowDefaultSquadNames ? 'custom' : 'new';

    // Initialize rate limiter and squad creation tracker
    this.rateLimiter = new Map();
    this.squadCreationTracker = new Map(); // Track squad creations over a period
  }

  bindEventHandlers() {
    this.handleNewGame = this.handleNewGame.bind(this);
    this.handleSquadCreated = this.handleSquadCreated.bind(this);
    this.handleRoundEnd = this.handleRoundEnd.bind(this);
  }

  async mount() {
    this.server.on('NEW_GAME', this.handleNewGame);
    this.server.on('SQUAD_CREATED', this.handleSquadCreated);
    this.server.on('ROUND_ENDED', this.handleRoundEnd);
  }

  async unmount() {
    this.clearBroadcasts();
    this.server.removeEventListener('NEW_GAME', this.handleNewGame);
    this.server.removeEventListener('SQUAD_CREATED', this.handleSquadCreated);
    this.server.removeEventListener('ROUND_ENDED', this.handleRoundEnd);
  }

  handleNewGame() {
    this.isBlocking = true;
    this.isRoundEnding = false;
    this.blockEndTime = Date.now() + this.blockDurationMs;
    this.squadCreationTracker.clear(); // Reset squad creation tracking for new game

    if (this.options.broadcastMode) {
        this.scheduleBroadcasts();
    }

    setTimeout(() => {
        this.isBlocking = false;
        this.server.rcon.broadcast(`${this.squadCreationType.charAt(0).toUpperCase() + this.squadCreationType.slice(1)} squad creation is now unlocked!`);
    }, this.blockDurationMs);
  }

  handleRoundEnd() {
    this.isBlocking = true;
    this.isRoundEnding = true;
    this.clearBroadcasts();
    this.squadCreationTracker.clear(); // Reset squad creation tracking for new round
    this.server.rcon.broadcast('Squad creation is currently blocked until the next round starts.');
  }

  isDefaultSquadName(squadName) {
    return /^[Ss]quad \d+$/.test(squadName);
  }

  checkRateLimit(player) {
    if (!this.options.rateLimitEnforced) {
      return true; // Skip rate limiting if it's disabled
    }

    const currentTime = Date.now();
    let playerRateData = this.rateLimiter.get(player.steamID);

    if (!playerRateData) {
      playerRateData = {
        timestamps: [],
        backoffUntil: 0,
      };
      this.rateLimiter.set(player.steamID, playerRateData);
    }

    const { timestamps, backoffUntil } = playerRateData;

    if (currentTime < backoffUntil) {
      return false; // Rate limit in effect
    }
	
	// Remove timestamps older than the rate limit window
    const validTimestamps = timestamps.filter(ts => currentTime - ts < this.options.rateLimitWindow * 1000);
    playerRateData.timestamps = validTimestamps;

    if (validTimestamps.length >= this.options.rateLimitMaxSquads) {
      playerRateData.backoffUntil = currentTime + this.options.rateLimitBackoffTime * 1000;
      this.rateLimiter.set(player.steamID, playerRateData);
      return false; // Player is rate limited
    }

	// Add the current timestamp
    validTimestamps.push(currentTime);
    playerRateData.timestamps = validTimestamps;
    this.rateLimiter.set(player.steamID, playerRateData);
    return true;
  }

  trackSquadCreation(player) {
    const currentTime = Date.now();
    let playerCreationData = this.squadCreationTracker.get(player.steamID);

    if (!playerCreationData) {
      playerCreationData = [];
      this.squadCreationTracker.set(player.steamID, playerCreationData);
    }

    playerCreationData = playerCreationData.filter(ts => currentTime - ts < this.options.timeWindowForKick * 1000);
    playerCreationData.push(currentTime);
    this.squadCreationTracker.set(player.steamID, playerCreationData);

    if (this.options.enforceMaxSquadCreationKick && playerCreationData.length > this.options.maxSquadsInTimeWindow) {
      this.kickPlayer(player);
    }
  }

  async kickPlayer(player) {
    const reason = `Excessive squad creations at round start. Please avoid spamming squad creations.`;
    await this.server.rcon.execute(`AdminKick ${player.steamID} "${reason}"`);
  }

  async handleSquadCreated(info) {
    const currentTime = Date.now();
	// Check if squad creation is blocked or if the round is ending
    if (this.isBlocking || this.isRoundEnding) {
      if (this.options.allowDefaultSquadNames && this.isDefaultSquadName(info.squadName)) {
        return; // Allow default squad names
      }
      // Increment the rate limit for this player
      const playerCanCreate = this.checkRateLimit(info.player);

      if (!playerCanCreate) {
        const backoffData = this.rateLimiter.get(info.player.steamID);
        if (backoffData) {
          const waitTime = Math.ceil((backoffData.backoffUntil - currentTime) / 1000);
          await this.server.rcon.warn(info.player.steamID, `You have exceeded the squad creation limit. Please wait ${waitTime} second${waitTime !== 1 ? 's' : ''}.`);
        }
      }
      // Disband the squad
      await this.server.rcon.execute(`AdminDisbandSquad ${info.player.teamID} ${info.player.squadID}`);
      await this.server.rcon.warn(info.player.steamID, `Custom squad creation is blocked for the first ${this.options.blockDuration} seconds of the game.`);
    }

    this.trackSquadCreation(info.player);
  }

  scheduleBroadcasts() {
    this.clearBroadcasts();

    const messageFrequency = 5000;
    const totalMessages = Math.floor(this.blockDurationMs / messageFrequency);

    for (let i = 1; i <= totalMessages; i++) {
      const delay = i * messageFrequency;
      const remainingTime = Math.ceil((this.blockDurationMs - delay) / 1000);

      const timeoutId = setTimeout(() => {
        this.server.rcon.broadcast(`${this.squadCreationType.charAt(0).toUpperCase() + this.squadCreationType.slice(1)} squad creation unlocked in ${remainingTime} second${remainingTime > 1 ? 's' : ''}!`);
      }, delay);

      this.broadcastTimeouts.push(timeoutId);
    }
  }

  clearBroadcasts() {
    this.broadcastTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.broadcastTimeouts = [];
  }
}