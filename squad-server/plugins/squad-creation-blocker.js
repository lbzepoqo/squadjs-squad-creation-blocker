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
    
    // Rate limiting data structures
    this.playerAttempts = new Map(); // steamID -> attempt count
    this.playerCooldowns = new Map(); // steamID -> cooldown end time
    this.pollIntervalId = null;
    this.cooldownWarningTimeouts = new Map(); // steamID -> timeout ID
    this.knownSquads = new Set(); // Track known squad IDs to detect new ones
    
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
    this.clearBroadcasts();
    this.clearCooldownWarnings();
    this.stopPolling();
    this.server.removeEventListener('NEW_GAME', this.handleNewGame);
    this.server.removeEventListener('SQUAD_CREATED', this.handleSquadCreated);
    this.server.removeEventListener('ROUND_ENDED', this.handleRoundEnd);
  }

  handleNewGame() {
    this.isBlocking = true;
    this.isRoundEnding = false;
    this.blockEndTime = Date.now() + this.blockDurationMs;

    // Reset rate limiting data for new game if scope is blocking period only
    if (this.options.rateLimitingScope === 'blockingPeriodOnly') {
      this.resetRateLimitingData();
    }

    // Initialize known squads
    this.initializeKnownSquads();

    if (this.options.broadcastMode) {
      this.scheduleBroadcasts();
    }

    // Start polling if rate limiting is enabled and scope includes blocking period
    if (this.options.enableRateLimiting && this.options.rateLimitingScope === 'blockingPeriodOnly') {
      this.startPolling();
    }

    setTimeout(() => {
      this.isBlocking = false;
      this.server.rcon.broadcast('Custom squad creation is now unlocked!');
      
      // Stop polling if scope is blocking period only
      if (this.options.enableRateLimiting && this.options.rateLimitingScope === 'blockingPeriodOnly') {
        this.stopPolling();
      }
    }, this.blockDurationMs);
  }

  handleRoundEnd() {
    this.isBlocking = true;
    this.isRoundEnding = true;
    this.clearBroadcasts();
    
    // Reset rate limiting data for round end if scope is blocking period only
    if (this.options.rateLimitingScope === 'blockingPeriodOnly') {
      this.resetRateLimitingData();
    }
  }

  isDefaultSquadName(squadName) {
    // Check if the squad name matches the pattern "Squad X" or "squad X" where X is a number
    return /^[Ss]quad \d+$/.test(squadName);
  }

  isPlayerInCooldown(steamID) {
    const cooldownEndTime = this.playerCooldowns.get(steamID);
    if (!cooldownEndTime) return false;
    
    if (Date.now() < cooldownEndTime) {
      return true;
    } else {
      // Cooldown expired, clean up
      this.playerCooldowns.delete(steamID);
      this.clearCooldownWarning(steamID);
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
    const steamID = info.player.steamID;
    
    // Check if we should block this squad creation
    const shouldBlock = this.isBlocking || (this.shouldApplyRateLimit() && this.isPlayerInCooldown(steamID));
    
    if (!shouldBlock) return;

    // Allow default squad names if the option is enabled (even during cooldown)
    if (this.options.allowDefaultSquadNames && this.isDefaultSquadName(info.squadName)) {
      return;
    }

    await this.server.rcon.execute(`AdminDisbandSquad ${info.player.teamID} ${info.player.squadID}`);

    // Apply rate limiting if enabled
    if (this.shouldApplyRateLimit()) {
      await this.processRateLimit(steamID, info.player, info.squadName);
    } else {
      // Standard blocking period message
      if (this.isRoundEnding) {
        await this.server.rcon.warn(steamID, "You are not allowed to create a custom squad at the end of a round.");
      } else if (!this.options.broadcastMode) {
        const timeLeft = Math.ceil((this.blockEndTime - Date.now()) / 1000);
        await this.server.rcon.warn(steamID, `Please wait for ${timeLeft} second${timeLeft !== 1 ? 's' : ''} before creating a custom squad. Default names (e.g. "Squad 1") are allowed.`);
      }
    }
  }

  async processRateLimit(steamID, player, squadName) {
    // Increment attempt counter
    const currentAttempts = (this.playerAttempts.get(steamID) || 0) + 1;
    this.playerAttempts.set(steamID, currentAttempts);

    // Check for kick threshold
    if (this.options.kickThreshold > 0 && currentAttempts >= this.options.kickThreshold) {
      await this.server.rcon.execute(`AdminKick "${steamID}" Excessive squad creation spam`);
      this.resetPlayerData(steamID);
      return;
    }

    // Check if player should be put in cooldown
    if (currentAttempts > this.options.warningThreshold) {
      const cooldownEndTime = Date.now() + (this.options.cooldownDuration * 1000);
      
      // Only set/reset cooldown if resetOnAttempt is true, or if player is not currently in cooldown
      if (this.options.resetOnAttempt || !this.isPlayerInCooldown(steamID)) {
        this.playerCooldowns.set(steamID, cooldownEndTime);
        
        await this.server.rcon.warn(steamID, `You are on cooldown for ${this.options.cooldownDuration}s due to squad creation spam. Stop spamming or you will be kicked!`);
        this.startCooldownWarning(steamID);
      }
    } else {
      // Send warning about approaching cooldown
      const remaining = this.options.warningThreshold - currentAttempts + 1;
      await this.server.rcon.warn(steamID, `Warning: Stop spamming squad creation! ${remaining} more attempt${remaining !== 1 ? 's' : ''} before cooldown.`);
    }
  }

  startCooldownWarning(steamID) {
    this.clearCooldownWarning(steamID);
    
    const warnAboutCooldown = async () => {
      const cooldownEndTime = this.playerCooldowns.get(steamID);
      if (!cooldownEndTime) return;
      
      const timeLeft = Math.ceil((cooldownEndTime - Date.now()) / 1000);
      if (timeLeft <= 0) {
        this.playerCooldowns.delete(steamID);
        this.clearCooldownWarning(steamID);
        await this.server.rcon.warn(steamID, "Squad creation cooldown has expired.");
        return;
      }
      
      await this.server.rcon.warn(steamID, `Squad creation cooldown: ${timeLeft} second${timeLeft !== 1 ? 's' : ''} remaining.`);
      
      const timeoutId = setTimeout(warnAboutCooldown, this.options.cooldownWarningInterval * 1000);
      this.cooldownWarningTimeouts.set(steamID, timeoutId);
    };
    
    const timeoutId = setTimeout(warnAboutCooldown, this.options.cooldownWarningInterval * 1000);
    this.cooldownWarningTimeouts.set(steamID, timeoutId);
  }

  clearCooldownWarning(steamID) {
    const timeoutId = this.cooldownWarningTimeouts.get(steamID);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.cooldownWarningTimeouts.delete(steamID);
    }
  }

  clearCooldownWarnings() {
    for (const timeoutId of this.cooldownWarningTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.cooldownWarningTimeouts.clear();
  }

  resetPlayerData(steamID) {
    this.playerAttempts.delete(steamID);
    this.playerCooldowns.delete(steamID);
    this.clearCooldownWarning(steamID);
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
    } catch (error) {
      this.verbose(1, `Error initializing known squads: ${error.message}`);
    }
  }

  async pollSquads() {
    if (!this.shouldApplyRateLimit()) return;

    try {
      const squads = await this.server.rcon.getSquads();
      
      for (const squad of squads) {
        const squadKey = `${squad.teamID}-${squad.squadID}`;
        
        // Skip if this squad was already known
        if (this.knownSquads.has(squadKey)) continue;
        
        // New squad detected
        this.knownSquads.add(squadKey);
        
        // Skip if it's a default squad name and default names are allowed
        if (this.options.allowDefaultSquadNames && this.isDefaultSquadName(squad.squadName)) {
          continue;
        }

        // Get creator's Steam ID
        const creatorSteamID = squad.creatorSteam;
        if (!creatorSteamID) continue;

        // Check if creator is in cooldown
        if (this.isPlayerInCooldown(creatorSteamID)) {
          // Don't disband if it's a default squad name and default names are allowed
          if (this.options.allowDefaultSquadNames && this.isDefaultSquadName(squad.squadName)) {
            continue;
          }
          
          await this.server.rcon.execute(`AdminDisbandSquad ${squad.teamID} ${squad.squadID}`);
          this.knownSquads.delete(squadKey); // Remove since we disbanded it
          
          // Reset cooldown and process rate limiting
          await this.processRateLimit(creatorSteamID, { teamID: squad.teamID, squadID: squad.squadID }, squad.squadName);
        } else if (this.isBlocking) {
          // During blocking period, disband non-default squads
          await this.server.rcon.execute(`AdminDisbandSquad ${squad.teamID} ${squad.squadID}`);
          this.knownSquads.delete(squadKey); // Remove since we disbanded it
          
          if (this.shouldApplyRateLimit()) {
            await this.processRateLimit(creatorSteamID, { teamID: squad.teamID, squadID: squad.squadID }, squad.squadName);
          }
        }
      }
    } catch (error) {
      this.verbose(1, `Error polling squads: ${error.message}`);
    }
  }

  startPolling() {
    if (this.pollIntervalId) return; // Already polling
    
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
