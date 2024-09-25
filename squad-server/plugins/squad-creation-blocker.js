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

    // Initialize rate limiter (stores timestamps and backoff status for each player)
    this.rateLimiter = new Map();
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
    this.server.rcon.broadcast('Squad creation is currently blocked until the next round starts.');
  }

  isDefaultSquadName(squadName) {
    // Check if the squad name matches the pattern "Squad X" or "squad X" where X is a number
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

    // Check if player is still in the backoff period
    if (currentTime < backoffUntil) {
      return false; // Rate limit in effect
    }

    // Remove timestamps older than the rate limit window
    const validTimestamps = timestamps.filter(ts => currentTime - ts < this.options.rateLimitWindow * 1000);
    playerRateData.timestamps = validTimestamps;

    // If the player exceeds the rate limit, apply backoff and return false
    if (validTimestamps.length >= this.options.rateLimitMaxSquads) {
      playerRateData.backoffUntil = currentTime + this.options.rateLimitBackoffTime * 1000;
      this.rateLimiter.set(player.steamID, playerRateData);
      return false; // Player is rate limited
    }

    // Add the current timestamp
    validTimestamps.push(currentTime);
    playerRateData.timestamps = validTimestamps;
    this.rateLimiter.set(player.steamID, playerRateData);
    return true; // Player can create a squad
  }

  async handleSquadCreated(info) {
  	const currentTime = Date.now();
  
  	// Check if squad creation is blocked or if the round is ending
  	if (this.isBlocking || this.isRoundEnding) {
      // Allow default squad names if the option is enabled
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
  		if (!this.options.broadcastMode) {
  			await this.server.rcon.warn(info.player.steamID, 'Squad creation is currently blocked.');
  		}
  		return; // Exit if blocked
  	}
  
  	// After global blocking time ends, check individual player backoff
  	const playerRateData = this.rateLimiter.get(info.player.steamID);
  
  
  	// Check if the player is still in backoff period
  	if (playerRateData && currentTime < playerRateData.backoffUntil) {
  		const waitTime = Math.ceil((playerRateData.backoffUntil - currentTime) / 1000);
  		await this.server.rcon.warn(info.player.steamID, `You are still rate limited for squad creations. Please wait ${waitTime} second${waitTime !== 1 ? 's' : ''}.`);
  		await this.server.rcon.execute(`AdminDisbandSquad ${info.player.teamID} ${info.player.squadID}`);
  		return; // Prevent squad creation if still in backoff
  	}
  
  }
  



  scheduleBroadcasts() {
    const broadcasts = [];
    for (let i = Math.floor(this.options.blockDuration / 10) * 10; i > 0; i -= 10) {
      const message = this.options.allowDefaultSquadNames
        ? `Custom squad creation will be unlocked in ${i} seconds. Default squad names are allowed.`
        : `New squad creation will be unlocked in ${i} seconds.`;
      broadcasts.push({ time: this.blockDurationMs - i * 1000, message });
    }

    broadcasts.forEach(broadcast => {
      const timeout = setTimeout(() => {
        this.server.rcon.broadcast(broadcast.message);
      }, broadcast.time);
      this.broadcastTimeouts.push(timeout);
    });
  }

  clearBroadcasts() {
    this.broadcastTimeouts.forEach(clearTimeout);
    this.broadcastTimeouts = [];
  }
}