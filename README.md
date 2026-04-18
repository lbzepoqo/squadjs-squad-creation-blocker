# SquadCreationBlocker

Blocks custom squad creation during the start-of-match window and at round end. Includes optional rate limiting with warnings, cooldowns, and auto-kick for persistent spammers.

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
  "cooldownWarningInterval": 3,
  "resetOnAttempt": false,
  "squadWhitelist": []
}
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `blockDuration` | `15` | Seconds after game start to block custom squad names |
| `broadcastMode` | `false` | Broadcast countdown to all players instead of warning the blocked player individually |
| `allowDefaultSquadNames` | `true` | Allow "Squad 1", "Squad 2", etc. during the blocking period |
| `enableRateLimiting` | `true` | Track and penalize spam creation attempts |
| `rateLimitingScope` | `"blockingPeriodOnly"` | `"blockingPeriodOnly"` or `"entireMatch"` — whether rate limiting applies only during the block window or the whole match |
| `warningThreshold` | `3` | Attempts before cooldown kicks in |
| `cooldownDuration` | `10` | Cooldown length in seconds |
| `kickThreshold` | `20` | Total attempts before kick (0 = disabled) |
| `pollInterval` | `1` | Polling interval in seconds for catching squads created between SQUAD_CREATED events |
| `cooldownWarningInterval` | `3` | How often (seconds) to remind a cooldown player of their remaining time |
| `resetOnAttempt` | `false` | When true, each new attempt restarts the cooldown instead of letting it expire |
| `squadWhitelist` | `[]` | Squad names always allowed, even during blocking (case-insensitive) |

