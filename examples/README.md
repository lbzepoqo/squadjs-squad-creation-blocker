# Configuration Examples

This directory contains example configuration files for the SquadCreationBlocker plugin. Choose the configuration that best fits your server's needs.

## Available Examples

### basic-config.json
- **Use Case**: Simple setup with default settings
- **Features**: 15-second blocking period, allows default squad names
- **Best For**: Servers wanting basic squad creation control

### enhanced-antispam-config.json
- **Use Case**: Advanced anti-spam protection
- **Features**: Entire match rate limiting, aggressive cooldowns, player kicks
- **Best For**: Servers with chronic spam issues

### broadcast-mode-config.json
- **Use Case**: Server-wide countdown announcements
- **Features**: Broadcast countdowns, no default squad names allowed
- **Best For**: Servers wanting visible countdown notifications

### strict-no-spam-config.json
- **Use Case**: Zero tolerance for spam
- **Features**: Immediate warnings, long cooldowns, quick kicks
- **Best For**: Competitive servers requiring strict discipline

## How to Use

1. Copy the desired configuration from this directory
2. Add it to your main SquadJS configuration file
3. Adjust values as needed for your server
4. Restart SquadJS to apply changes

## Customization Tips

- **blockDuration**: Adjust based on your server's game startup patterns
- **rateLimitingScope**: Use "blockingPeriodOnly" for lighter enforcement
- **warningThreshold**: Lower values for stricter spam control
- **kickThreshold**: Set to 0 to disable kicks entirely
- **resetOnAttempt**: Enable for persistent spammer prevention