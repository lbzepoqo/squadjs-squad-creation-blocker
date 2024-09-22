import BasePlugin from './base-plugin.js';

export default class SquadCreationBlocker extends BasePlugin {
  static get description() {
    return 'The <code>SquadCreationBlocker</code> plugin prevents squads with custom names from being created within a specified time after a new game starts and at the end of a round. It can either broadcast countdown messages or send individual warnings to players attempting to create squads.';
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
  }

  isDefaultSquadName(squadName) {
    // Check if the squad name matches the pattern "Squad X" or "squad X" where X is a number
    return /^[Ss]quad \d+$/.test(squadName);
  }

  async handleSquadCreated(info) {
    if (!this.isBlocking) return;

    // Allow default squad names if the option is enabled
    if (this.options.allowDefaultSquadNames && this.isDefaultSquadName(info.squadName)) {
      return;
    }

    await this.server.rcon.execute(`AdminDisbandSquad ${info.player.teamID} ${info.player.squadID}`);

    if (!this.options.broadcastMode) {
      if (this.isRoundEnding) {
        await this.server.rcon.warn(info.player.steamID, `You are not allowed to create a ${this.squadCreationType} squad at the end of a round.`);
      } else {
        const timeLeft = Math.ceil((this.blockEndTime - Date.now()) / 1000);
        const message = this.options.allowDefaultSquadNames
          ? `Please wait for ${timeLeft} second${timeLeft !== 1 ? 's' : ''} before creating a custom squad. You can create a squad with a default name (e.g., "Squad 1") in the meantime.`
          : `Please wait for ${timeLeft} second${timeLeft !== 1 ? 's' : ''} before creating a new squad.`;
        await this.server.rcon.warn(info.player.steamID, message);
      }
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
