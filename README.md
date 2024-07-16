# SquadCreationBlocker Plugin for SquadJS

## Description

The SquadCreationBlocker plugin is designed for SquadJS to manage and control squad creation in Squad servers. It prevents squads from being created within a specified time after a new game starts and at the end of a round. It offers two modes of operation: broadcasting countdown messages or sending individual warnings to players attempting to create squads.

## Features

- Blocks squad creation for a configurable duration at the start of each new game.
- Prevents squad creation at the end of a round.
- Two modes of operation: broadcast mode and warning mode.
- Configurable block duration.
- Provides feedback to players attempting to create squads during blocked periods.

## Installation

1. Ensure you have [SquadJS](https://github.com/Team-Silver-Sphere/SquadJS) installed and configured.
2. Place the `squad-creation-blocker.js` file in your SquadJS plugins directory.
3. Update your SquadJS configuration file to include the SquadCreationBlocker plugin.

## Configuration

Add the following to your SquadJS configuration file:

```json
{
  "plugin": "SquadCreationBlocker",
  "enabled": true,
  "blockDuration": 15,
  "broadcastMode": false
}
```

### Options

- `enabled`: Set to `true` to enable the plugin, `false` to disable.
- `blockDuration`: The duration (in seconds) after a new game starts during which squad creation is blocked. Default is 15 seconds.
- `broadcastMode`: Set to `true` to enable countdown broadcasts, `false` to enable individual warnings. Default is false.

## Usage

Once configured and enabled, the plugin will automatically:

1. Block squad creation for the specified duration at the start of each new game.
2. Prevent squad creation at the end of each round.
3. If `broadcastMode` is set to `true`:
   - Broadcast countdown messages at multiples of 10 seconds.
   - Broadcast a message when squad creation is unlocked.
4. If `broadcastMode` is set to `false`:
   - Send individual warnings to players attempting to create squads during the blocked period.
5. Disband any squads created during the blocked period.

## Behavior

- **New Game Start**: 
  - Blocks squad creation for the specified `blockDuration`.
  - If in broadcast mode, schedules countdown broadcasts.
  - When the block period ends, allows squad creation and broadcasts an "unlocked" message.

- **Round End**: 
  - Blocks squad creation indefinitely until the next game starts.
  - Cancels any scheduled broadcasts.

- **Squad Creation Attempt During Blocked Period**:
  - Disbands the squad immediately.
  - If in warning mode:
    - During new game block: Informs how many seconds remain before they can create a squad.
    - During round end: Informs that squad creation is not allowed at the end of a round.

## Dependencies

- SquadJS

## Contributing

Contributions to improve the SquadCreationBlocker plugin are welcome. Please feel free to submit pull requests or create issues for bugs and feature requests.

## License

This plugin is released under the GNU Affero General Public License v3.0. See the LICENSE file for more details.

## Support

For support, please create an issue in the GitHub repository or contact the plugin maintainer.
