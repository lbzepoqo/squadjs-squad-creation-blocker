import BasePlugin from './base-plugin.js';

export default class SquadCreationBlocker extends BasePlugin {
  static get description() {
    return 'The <code>SquadCreationBlocker</code> plugin prevents squads from being created within a specified time after a new game starts and at the end of a round. It can also optionally broadcast a countdown until squad creation is unlocked.';
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      blockDuration: {
        required: false,
        description: 'Time period after a new game starts during which squad creation is blocked (in seconds).',
        default: 15
      },
      enableCountdownBroadcast: {
        required: false,
        description: 'Whether to enable the countdown broadcast feature.',
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
    this.countdownInterval = null;
    this.bindEventHandlers();
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
    this.stopCountdownBroadcast();
    this.server.removeEventListener('NEW_GAME', this.handleNewGame);
    this.server.removeEventListener('SQUAD_CREATED', this.handleSquadCreated);
    this.server.removeEventListener('ROUND_ENDED', this.handleRoundEnd);
  }

  handleNewGame() {
    this.isBlocking = true;
    this.isRoundEnding = false;
    this.blockEndTime = Date.now() + this.blockDurationMs;

    if (this.options.enableCountdownBroadcast) {
      this.startCountdownBroadcast();
    }

    setTimeout(() => {
      this.isBlocking = false;
      if (this.options.enableCountdownBroadcast) {
        this.stopCountdownBroadcast();
        this.server.rcon.execute('AdminBroadcast Squad creation is now unlocked!');
      }
    }, this.blockDurationMs);
  }

  handleRoundEnd() {
    this.isBlocking = true;
    this.isRoundEnding = true;
    this.stopCountdownBroadcast();
  }

  async handleSquadCreated(info) {
    if (!this.isBlocking) return;

    await this.server.rcon.execute(`AdminDisbandSquad ${info.player.teamID} ${info.player.squadID}`);

    if (this.isRoundEnding) {
      await this.server.rcon.warn(info.player.steamID, "You are not allowed to create a squad at the end of a round.");
    } else {
      const timeLeft = Math.ceil((this.blockEndTime - Date.now()) / 1000);
      await this.server.rcon.warn(info.player.steamID, `Please wait for ${timeLeft} second${timeLeft !== 1 ? 's' : ''} before creating a squad.`);
    }
  }

  startCountdownBroadcast() {
    this.countdownInterval = setInterval(() => {
      const timeLeft = Math.ceil((this.blockEndTime - Date.now()) / 1000);
      if (timeLeft > 0) {
        this.server.rcon.execute(`AdminBroadcast Squad creation will be unlocked in ${timeLeft} second${timeLeft !== 1 ? 's' : ''}`);
      } else {
        this.stopCountdownBroadcast();
      }
    }, 1000);
  }

  stopCountdownBroadcast() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }
}
