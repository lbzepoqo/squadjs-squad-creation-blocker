# SquadCreationBlocker Plugin for SquadJS

## Description

The SquadCreationBlocker plugin is designed for SquadJS to manage and control squad creation in Squad servers. It prevents squads from being created within a specified time after a new game starts and at the end of a round. Additionally, it offers an optional feature to broadcast a countdown when 10 seconds are left and when squad creation is unlocked.

## Features

- Blocks squad creation for a configurable duration at the start of each new game.
- Prevents squad creation at the end of a round.
- Optional countdown broadcast feature to inform players when squad creation will be unlocked.
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
  "enableCountdownBroadcast": false
}
```

### Options

- `enabled`: Set to `true` to enable the plugin, `false` to disable.
- `blockDuration`: The duration (in seconds) after a new game starts during which squad creation is blocked. Default is 15 seconds.
- `enableCountdownBroadcast`: Set to `true` to enable countdown broadcasts, `false` to disable. Default is false.

## Usage

Once configured and enabled, the plugin will automatically:

1. Block squad creation for the specified duration at the start of each new game.
2. Prevent squad creation at the end of each round.
3. If `enableCountdownBroadcast` is set to `true`:
   - Broadcast a message when 10 seconds are left before squad creation is unlocked.
   - Broadcast a message when squad creation is unlocked.
4. Disband any squads created during the blocked period and warn the player who attempted to create the squad.

## Behavior

- **New Game Start**: 
  - Blocks squad creation for the specified `blockDuration`.
  - If enabled, schedules a broadcast for 10 seconds before unlocking.
  - When the block period ends, allows squad creation and broadcasts an "unlocked" message if countdown was enabled.

- **Round End**: 
  - Blocks squad creation indefinitely until the next game starts.
  - Cancels any scheduled broadcasts.

- **Squad Creation Attempt During Blocked Period**:
  - Disbands the squad immediately.
  - Warns the player with a message:
    - During new game: Informs how many seconds remain before they can create a squad.
    - During round end: Informs that squad creation is not allowed at the end of a round.

## Dependencies

- SquadJS

## Contributing

Contributions to improve the SquadCreationBlocker plugin are welcome. Please feel free to submit pull requests or create issues for bugs and feature requests.

## License

This plugin is released under the GNU Affero General Public License v3.0. See the LICENSE file for more details.

## Support

For support, please create an issue in the GitHub repository or contact the plugin maintainer.
