# SquadJS Squad Creation Blocker Plugin

A robust SquadJS plugin that prevents custom squad creation during critical game phases while implementing intelligent anti-spam protection with rate limiting, cooldowns, and kick functionality. Features flexible configuration options and comprehensive monitoring capabilities.

## Features

- **🚫 Smart Blocking**: Prevents custom squad creation during game start and round end phases
- **🛡️ Anti-Spam Protection**: Advanced rate limiting with configurable warnings and cooldowns
- **📢 Flexible Messaging**: Choose between broadcast countdowns or individual player warnings
- **🔄 Intelligent Monitoring**: Periodic squad polling to detect and handle creation bypasses
- **⚙️ Granular Control**: Extensive configuration options for fine-tuning behavior
- **🎯 Default Name Support**: Optionally allows default squad names (e.g., "Squad 1") during blocking periods

## Installation

1. Copy `squad-creation-blocker.js` to your SquadJS `plugins` directory:
   ```bash
   cp squad-creation-blocker.js /path/to/squadjs/squad-server/plugins/
   ```

2. Add the plugin configuration to your `config.json`:
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
     "resetOnAttempt": false
   }
   ```

3. Restart your SquadJS server

## Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `blockDuration` | number | No | 15 | Time period after game start during which custom squad creation is blocked (seconds) |
| `broadcastMode` | boolean | No | false | If true, uses countdown broadcasts. If false, sends individual warnings |
| `allowDefaultSquadNames` | boolean | No | true | Allow creation of squads with default names during blocking period |
| `enableRateLimiting` | boolean | No | true | Enable anti-spam rate limiting for squad creation attempts |
| `rateLimitingScope` | string | No | "blockingPeriodOnly" | When to apply rate limiting: "blockingPeriodOnly" or "entireMatch" |
| `warningThreshold` | number | No | 3 | Number of attempts before issuing warnings to the player |
| `cooldownDuration` | number | No | 10 | Duration of cooldown period in seconds after exceeding warning threshold |
| `kickThreshold` | number | No | 20 | Number of attempts before kicking the player (0 to disable) |
| `pollInterval` | number | No | 1 | Interval in seconds for periodic squad checking |
| `cooldownWarningInterval` | number | No | 3 | Interval in seconds for warning players about remaining cooldown time |
| `resetOnAttempt` | boolean | No | false | If true, cooldown timer resets on each new attempt. If false, cooldown must expire before new attempts trigger rate limiting |

## Usage Examples

### Basic Configuration
```json
{
  "plugin": "SquadCreationBlocker",
  "enabled": true,
  "blockDuration": 30,
  "allowDefaultSquadNames": true
}
```

### Enhanced Anti-Spam Setup
```json
{
  "plugin": "SquadCreationBlocker",
  "enabled": true,
  "blockDuration": 15,
  "broadcastMode": false,
  "allowDefaultSquadNames": true,
  "enableRateLimiting": true,
  "rateLimitingScope": "entireMatch",
  "warningThreshold": 2,
  "cooldownDuration": 15,
  "kickThreshold": 10,
  "pollInterval": 1,
  "cooldownWarningInterval": 3,
  "resetOnAttempt": true
}
```

### Broadcast Mode Configuration
```json
{
  "plugin": "SquadCreationBlocker",
  "enabled": true,
  "blockDuration": 20,
  "broadcastMode": true,
  "allowDefaultSquadNames": false,
  "enableRateLimiting": false
}
```

### Strict No-Spam Policy
```json
{
  "plugin": "SquadCreationBlocker",
  "enabled": true,
  "blockDuration": 10,
  "enableRateLimiting": true,
  "rateLimitingScope": "entireMatch",
  "warningThreshold": 1,
  "cooldownDuration": 30,
  "kickThreshold": 5,
  "cooldownWarningInterval": 5,
  "resetOnAttempt": false
}
```

## How It Works

### Blocking Phases

**Game Start Phase:**
- Blocks custom squad creation for configured duration after new game starts
- Optionally allows default squad names (e.g., "Squad 1", "Squad 2")
- Provides countdown notifications or individual warnings

**Round End Phase:**
- Prevents all custom squad creation when round ends
- Continues until next game begins

### Rate Limiting System

The plugin implements a sophisticated anti-spam system:

1. **Attempt Tracking**: Monitors squad creation attempts per player
2. **Warning System**: Issues warnings when threshold is exceeded
3. **Cooldown Enforcement**: Applies temporary cooldowns to repeat offenders
4. **Kick Protection**: Removes persistent spammers from the server
5. **Flexible Reset**: Configurable cooldown reset behavior

### Monitoring Capabilities

- **Event-Based Detection**: Responds to SQUAD_CREATED events
- **Periodic Polling**: Scans existing squads to catch bypassed creations
- **Intelligent Filtering**: Distinguishes between default and custom squad names
- **Collision Prevention**: Prevents conflicts between different detection methods

## Behavior Examples

### Standard Blocking Message
```
Please wait for 12 seconds before creating a custom squad. Default names (e.g. "Squad 1") are allowed.
```

### Broadcast Mode Messages
```
Custom squad names unlock in 10s. Default names (e.g. "Squad 1") are allowed. Spammers get 10s cooldown.
```

### Rate Limiting Warnings
```
Warning: Stop spamming squad creation! 2 more attempts before cooldown.
You are on cooldown for 10s due to squad creation spam. Stop spamming or you will be kicked!
Squad creation cooldown: 7 seconds remaining.
```

### Round End Blocking
```
You are not allowed to create a custom squad at the end of a round.
```

## Troubleshooting

### Common Issues

**Plugin not blocking squads:**
- Check that plugin is enabled in configuration
- Verify SquadJS has proper RCON permissions
- Ensure `blockDuration` is greater than 0

**Rate limiting not working:**
- Confirm `enableRateLimiting` is set to true
- Check `rateLimitingScope` setting matches your needs
- Verify `warningThreshold` and `cooldownDuration` are configured

**Broadcast messages not appearing:**
- Ensure `broadcastMode` is set to true
- Check that `blockDuration` is long enough for broadcasts
- Verify RCON broadcast permissions

**Default squad names still blocked:**
- Confirm `allowDefaultSquadNames` is set to true
- Check that squad names match the pattern "Squad X" (case-insensitive)
- Verify no custom rate limiting rules are interfering

### Debug Mode

Enable verbose logging in SquadJS config:
```json
{
  "logger": {
    "verboseness": 2
  }
}
```

Common log messages:
- `Error initializing known squads`: RCON connection issues
- `Error polling squads`: Permission or connectivity problems
- Squad creation blocked messages indicate normal operation

## Advanced Configuration

### Rate Limiting Scopes

**blockingPeriodOnly (Default):**
- Rate limiting only applies during blocking periods
- Resets when blocking period ends
- Suitable for most servers

**entireMatch:**
- Rate limiting applies throughout the entire match
- Persistent tracking across game phases
- Best for servers with chronic spam issues

### Cooldown Reset Behavior

**resetOnAttempt: false (Default):**
- Cooldown must fully expire before new attempts trigger rate limiting
- More forgiving approach
- Prevents cooldown stacking

**resetOnAttempt: true:**
- Each new attempt resets the cooldown timer
- Stricter anti-spam enforcement
- Effective against persistent spammers

## Requirements

- SquadJS v3.0+
- Squad server with RCON enabled
- Node.js 16+
- Admin permissions for disbanding squads and kicking players

## License

This plugin is released under the GNU Affero General Public License v3.0. See LICENSE file for details.

## Contributing

Issues and pull requests are welcome! Please ensure your code follows the existing style and includes appropriate tests.

## Support

For support, please open an issue in the GitHub repository or contact via the SquadJS Discord community.