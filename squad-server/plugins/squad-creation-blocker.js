import BasePlugin from './base-plugin.js';

export default class SquadCreationBlocker extends BasePlugin {
  static get description() {
    return 'The <code>SquadCreationBlocker</code> plugin prevents squads with custom names from being created within a specified time after a new game starts and at the end of a round. It includes anti-spam rate limiting with configurable warnings, cooldowns, kick functionality, and optional cooldown reset behavior to prevent players from overwhelming the system.';
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
      enableRateLimiting: {
        required: false,
        description: 'Enable anti-spam rate limiting for squad creation attempts.',
        default: true
      },
      rateLimitingScope: {
        required: false,
        description: 'When to apply rate limiting: "blockingPeriodOnly" or "entireMatch".',
        default: 'blockingPeriodOnly'
      },
      warningThreshold: {
        required: false,
        description: 'Number of attempts before issuing warnings to the player.',
        default: 3
      },
      cooldownDuration: {
        required: false,
        description: 'Duration of cooldown period in seconds after exceeding warning threshold.',
        default: 10
      },
      kickThreshold: {
        required: false,
        description: 'Number of attempts before kicking the player (0 to disable).',
        default: 20
      },
      pollInterval: {
        required: false,
        description: 'Interval in seconds for periodic squad checking.',
        default: 1
      },
      cooldownWarningInterval: {
        required: false,
        description: 'Interval in seconds for warning players about remaining cooldown time.',
        default: 3
      },
      resetOnAttempt: {
        required: false,
        description: 'If true, cooldown timer resets on each new attempt. If false, cooldown must expire before new attempts trigger rate limiting.',
        default: false
      },
      squadWhitelist: {
        required: false,
        description: 'Array of squad names that are always allowed, even during blocking periods. Names are matched case-insensitively.',
        default: []
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.isBlocking = false;
    this.isRoundEnding = false;
    this.blockDurationMs = this.options.blockDuration * 1000;
    this.blockEndTime = 0;
    this.blockTimeoutId = null;
    this.broadcastTimeouts = [];
    this.playerAttempts = new Map();
    this.playerCooldowns = new Map();
    this.pollIntervalId = null;
    this.isPollRunning = false;
    this.cooldownWarningTimeouts = new Map();
    this.knownSquads = new Set();
    this.bindEventHandlers();
  }

  bindEventHandlers() {
    this.handleNewGame = this.handleNewGame.bind(this);
    this.handleSquadCreated = this.handleSquadCreated.bind(this);
    this.handleRoundEnd = this.handleRoundEnd.bind(this);
    this.pollSquads = this.pollSquads.bind(this);
  }

  async mount() {
    this.server.on('NEW_GAME', this.handleNewGame);
    this.server.on('SQUAD_CREATED', this.handleSquadCreated);
    this.server.on('ROUND_ENDED', this.handleRoundEnd);
    
    if (this.options.enableRateLimiting && this.options.rateLimitingScope === 'entireMatch') {
      this.startPolling();
    }
  }

  async unmount() {
    clearTimeout(this.blockTimeoutId);
    this.clearBroadcasts();
    this.clearCooldownWarnings();
    this.stopPolling();
    this.server.removeEventListener('NEW_GAME', this.handleNewGame);
    this.server.removeEventListener('SQUAD_CREATED', this.handleSquadCreated);
    this.server.removeEventListener('ROUND_ENDED', this.handleRoundEnd);
  }

  async handleNewGame() {
    clearTimeout(this.blockTimeoutId);
    this.isBlocking = true;
    this.isRoundEnding = false;
    this.blockEndTime = Date.now() + this.blockDurationMs;

    if (this.options.rateLimitingScope === 'blockingPeriodOnly') {
      this.resetRateLimitingData();
    }

    await this.initializeKnownSquads();

    this.clearBroadcasts();
    if (this.options.broadcastMode) {
      this.scheduleBroadcasts();
    }

    if (this.options.enableRateLimiting && this.options.rateLimitingScope === 'blockingPeriodOnly') {
      this.startPolling();
    }

    this.blockTimeoutId = setTimeout(() => {
      this.isBlocking = false;
      this.server.rcon.broadcast('Custom squad creation is now unlocked!');
      if (this.options.enableRateLimiting && this.options.rateLimitingScope === 'blockingPeriodOnly') {
        this.stopPolling();
      }
    }, this.blockDurationMs);
  }

  handleRoundEnd() {
    this.isBlocking = true;
    this.isRoundEnding = true;
    this.clearBroadcasts();
    if (this.options.rateLimitingScope === 'blockingPeriodOnly') {
      this.resetRateLimitingData();
    }
  }

  isDefaultSquadName(squadName) {
    return /^[Ss]quad \d+$/.test(squadName);
  }

  isWhitelistedSquadName(squadName) {
    const lowerSquadName = squadName.toLowerCase();
    return this.options.squadWhitelist.some(whitelistedName => whitelistedName.toLowerCase() === lowerSquadName);
  }

  isPlayerInCooldown(playerID) {
    const cooldownEndTime = this.playerCooldowns.get(playerID);
    if (!cooldownEndTime) return false;
    if (Date.now() < cooldownEndTime) {
      return true;
    } else {
      this.playerCooldowns.delete(playerID);
      this.clearCooldownWarning(playerID);
      return false;
    }
  }

  shouldApplyRateLimit() {
    if (!this.options.enableRateLimiting) return false;
    
    if (this.options.rateLimitingScope === 'entireMatch') return true;
    if (this.options.rateLimitingScope === 'blockingPeriodOnly') return this.isBlocking;
    
    return false;
  }

  async handleSquadCreated(info) {
    const playerID = info.player.eosID || info.player.steamID;
    const shouldBlock = this.isBlocking || (this.shouldApplyRateLimit() && this.isPlayerInCooldown(playerID));
    if (!shouldBlock) return;
    if (this.isWhitelistedSquadName(info.squadName)) return;
    if (this.options.allowDefaultSquadNames && this.isDefaultSquadName(info.squadName)) return;

    await this.server.rcon.execute(`AdminDisbandSquad ${info.player.teamID} ${info.player.squadID}`);

    if (this.shouldApplyRateLimit()) {
      await this.processRateLimit(playerID);
    } else {
      if (this.isRoundEnding) {
        await this.server.rcon.warn(playerID, "You are not allowed to create a custom squad at the end of a round.");
      } else if (!this.options.broadcastMode) {
        const timeLeft = Math.ceil((this.blockEndTime - Date.now()) / 1000);
        await this.server.rcon.warn(playerID, `Please wait for ${timeLeft} second${timeLeft !== 1 ? 's' : ''} before creating a custom squad. Default names (e.g. "Squad 1") are allowed.`);
      }
    }
  }

  async processRateLimit(playerID) {
    const currentAttempts = (this.playerAttempts.get(playerID) || 0) + 1;
    this.playerAttempts.set(playerID, currentAttempts);

    if (this.options.kickThreshold > 0 && currentAttempts >= this.options.kickThreshold) {
      await this.server.rcon.execute(`AdminKick "${playerID}" Excessive squad creation spam`);
      this.resetPlayerData(playerID);
      return;
    }

    if (currentAttempts > this.options.warningThreshold) {
      const cooldownEndTime = Date.now() + (this.options.cooldownDuration * 1000);
      // resetOnAttempt lets spammers extend their own cooldown; without it, the first trigger is the only one
      if (this.options.resetOnAttempt || !this.isPlayerInCooldown(playerID)) {
        this.playerCooldowns.set(playerID, cooldownEndTime);
        await this.server.rcon.warn(playerID, `You are on cooldown for ${this.options.cooldownDuration}s due to squad creation spam. Stop spamming or you will be kicked!`);
        this.startCooldownWarning(playerID);
      }
    } else {
      const remaining = this.options.warningThreshold - currentAttempts + 1;
      await this.server.rcon.warn(playerID, `Warning: Stop spamming squad creation! ${remaining} more attempt${remaining !== 1 ? 's' : ''} before cooldown.`);
    }
  }

  startCooldownWarning(playerID) {
    this.clearCooldownWarning(playerID);
    
    const warnAboutCooldown = async () => {
      const cooldownEndTime = this.playerCooldowns.get(playerID);
      if (!cooldownEndTime) return;
      
      const timeLeft = Math.ceil((cooldownEndTime - Date.now()) / 1000);
      if (timeLeft <= 0) {
        this.playerCooldowns.delete(playerID);
        this.clearCooldownWarning(playerID);
        await this.server.rcon.warn(playerID, "Squad creation cooldown has expired.");
        return;
      }
      
      await this.server.rcon.warn(playerID, `Squad creation cooldown: ${timeLeft} second${timeLeft !== 1 ? 's' : ''} remaining.`);
      
      const timeoutId = setTimeout(warnAboutCooldown, this.options.cooldownWarningInterval * 1000);
      this.cooldownWarningTimeouts.set(playerID, timeoutId);
    };
    
    const timeoutId = setTimeout(warnAboutCooldown, this.options.cooldownWarningInterval * 1000);
    this.cooldownWarningTimeouts.set(playerID, timeoutId);
  }

  clearCooldownWarning(playerID) {
    const timeoutId = this.cooldownWarningTimeouts.get(playerID);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.cooldownWarningTimeouts.delete(playerID);
    }
  }

  clearCooldownWarnings() {
    for (const timeoutId of this.cooldownWarningTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.cooldownWarningTimeouts.clear();
  }

  resetPlayerData(playerID) {
    this.playerAttempts.delete(playerID);
    this.playerCooldowns.delete(playerID);
    this.clearCooldownWarning(playerID);
  }

  resetRateLimitingData() {
    this.playerAttempts.clear();
    this.playerCooldowns.clear();
    this.clearCooldownWarnings();
  }

  async initializeKnownSquads() {
    try {
      const squads = await this.server.rcon.getSquads();
      this.knownSquads.clear();
      for (const squad of squads) {
        this.knownSquads.add(`${squad.teamID}-${squad.squadID}`);
      }
    } catch (err) {
      this.verbose(1, `Error initializing known squads: ${err.message}`);
    }
  }

  async pollSquads() {
    if (!this.shouldApplyRateLimit()) return;
    if (this.isPollRunning) return;
    this.isPollRunning = true;

    try {
      const squads = await this.server.rcon.getSquads();

      for (const squad of squads) {
        const squadKey = `${squad.teamID}-${squad.squadID}`;
        if (this.knownSquads.has(squadKey)) continue;
        this.knownSquads.add(squadKey);

        if (this.isWhitelistedSquadName(squad.squadName)) continue;
        if (this.options.allowDefaultSquadNames && this.isDefaultSquadName(squad.squadName)) continue;

        const creatorID = squad.creatorEOSID || squad.creatorSteamID;
        if (!creatorID) continue;

        if (this.isPlayerInCooldown(creatorID) || this.isBlocking) {
          await this.server.rcon.execute(`AdminDisbandSquad ${squad.teamID} ${squad.squadID}`);
          this.knownSquads.delete(squadKey);
          await this.processRateLimit(creatorID);
        }
      }
    } catch (error) {
      this.verbose(1, `Error polling squads: ${error.message}`);
    } finally {
      this.isPollRunning = false;
    }
  }

  startPolling() {
    if (this.pollIntervalId) return;
    this.pollIntervalId = setInterval(this.pollSquads, this.options.pollInterval * 1000);
  }

  stopPolling() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  scheduleBroadcasts() {
    const broadcasts = [];
    for (let i = Math.floor(this.options.blockDuration / 10) * 10; i > 0; i -= 10) {
      broadcasts.push({
        time: this.blockDurationMs - i * 1000,
        message: `Custom squad names unlocks in ${i}s. Default names (e.g. "Squad 1") are allowed. Spammers get ${this.options.cooldownDuration}s cooldown.`
      });
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