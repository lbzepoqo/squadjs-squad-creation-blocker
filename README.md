# SquadCreationBlocker Plugin

## Description

Prevents custom squad creation during the initial period of new games and at round end. Includes anti-spam features with rate limiting, cooldowns, and optional kick functionality.

## Features

- Blocks custom squad creation for configurable duration after game start
- Prevents custom squad creation at round end
- Optional default squad names (e.g., "Squad 1") during blocked periods
- Anti-spam rate limiting with warnings, cooldowns, and kicks
- Broadcast or individual warning modes
- Periodic squad monitoring to catch bypassed creations

## Configuration

```json
{
  "plugin": "SquadCreationBlocker",
  "enabled": true,
  "blockDuration": 15,
  "broadcastMode": false,
  "allowDefaultSquadNames": true,
  "enableRateLimiting": true,
  "rateLimitingScope": "blockingPeriodOnly",
  "warningThreshold": 3,
  "cooldownDuration": 10,
  "kickThreshold": 20,
  "pollInterval": 1,
  "cooldownWarningInterval": 3
}
```

### Key Options

- **blockDuration**: Block duration in seconds after game start (default: 15)
- **broadcastMode**: Use countdown broadcasts instead of individual warnings (default: false)
- **allowDefaultSquadNames**: Allow "Squad X" names during blocking (default: true)
- **enableRateLimiting**: Enable anti-spam protection (default: true)
- **rateLimitingScope**: Apply rate limiting "blockingPeriodOnly" or "entireMatch" (default: "blockingPeriodOnly")
- **warningThreshold**: Attempts before warnings (default: 3)
- **cooldownDuration**: Cooldown period in seconds (default: 10)
- **kickThreshold**: Attempts before kick, 0 to disable (default: 20)

## Behavior

- **Game Start**: Blocks custom squads for specified duration, allows default names
- **Round End**: Blocks all custom squad creation until next game
- **Rate Limiting**: Tracks attempts, applies cooldowns, and kicks repeat offenders
- **Squad Detection**: Monitors existing squads via polling to catch creation bypasses

## Installation

1. Place `squad-creation-blocker.js` in your SquadJS plugins directory
2. Add configuration to your SquadJS config file
3. Restart SquadJS

## License

GNU Affero General Public License v3.0 - See [LICENSE](/LICENSE)
