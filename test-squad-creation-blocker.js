/**
 * Tests for SquadCreationBlocker plugin.
 * Run with: node test-squad-creation-blocker.js
 */

import SquadCreationBlocker from './squad-server/plugins/squad-creation-blocker.js';

let passes = 0;
let failures = 0;

function assert(condition, message) {
  if (condition) {
    passes++;
    console.log(`  ✓ ${message}`);
  } else {
    failures++;
    console.log(`  ✗ ${message}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockServer() {
  const calls = { warns: [], executes: [], broadcasts: [], getSquadsResult: [] };
  return {
    calls,
    rcon: {
      warn: async (steamID, msg) => calls.warns.push({ steamID, msg }),
      execute: async (cmd) => calls.executes.push(cmd),
      broadcast: async (msg) => calls.broadcasts.push(msg),
      getSquads: async () => calls.getSquadsResult,
    },
    on: () => {},
    removeEventListener: () => {},
  };
}

const realTimers = {
  setTimeout: global.setTimeout,
  clearTimeout: global.clearTimeout,
  setInterval: global.setInterval,
  clearInterval: global.clearInterval,
};

function installMockTimers() {
  const cleared = new Set();
  let id = 0;
  global.setTimeout = () => ++id;
  global.clearTimeout = (tid) => { if (tid != null) cleared.add(tid); };
  global.setInterval = () => ++id;
  global.clearInterval = (tid) => { if (tid != null) cleared.add(tid); };
  return cleared;
}

function restoreTimers() {
  Object.assign(global, realTimers);
}

function makePlugin(rawOptions = {}, server = null) {
  const s = server ?? makeMockServer();
  const plugin = new SquadCreationBlocker(s, rawOptions, {});
  plugin.verbose = () => {};
  return { plugin, server: s };
}

// ─── isDefaultSquadName ──────────────────────────────────────────────────────

console.log('\n--- isDefaultSquadName ---');
{
  const { plugin } = makePlugin();
  assert(plugin.isDefaultSquadName('Squad 1'), '"Squad 1" is default');
  assert(plugin.isDefaultSquadName('squad 99'), '"squad 99" matches lowercase s variant');
  assert(!plugin.isDefaultSquadName('Alpha'), '"Alpha" is not default');
  assert(!plugin.isDefaultSquadName('Squad1'), '"Squad1" without space is not default');
  assert(!plugin.isDefaultSquadName('My Squad 1'), 'prefixed name is not default');
}

// ─── isWhitelistedSquadName ──────────────────────────────────────────────────

console.log('\n--- isWhitelistedSquadName ---');
{
  const { plugin } = makePlugin({ squadWhitelist: ['Alpha', 'BRAVO'] });
  assert(plugin.isWhitelistedSquadName('Alpha'), 'exact match');
  assert(plugin.isWhitelistedSquadName('alpha'), 'case-insensitive player input');
  assert(plugin.isWhitelistedSquadName('bravo'), 'case-insensitive whitelist entry');
  assert(!plugin.isWhitelistedSquadName('Charlie'), 'unlisted name rejected');
}

// ─── shouldApplyRateLimit ────────────────────────────────────────────────────

console.log('\n--- shouldApplyRateLimit ---');
{
  const { plugin: disabled } = makePlugin({ enableRateLimiting: false });
  assert(!disabled.shouldApplyRateLimit(), 'false when rate limiting disabled');

  const { plugin: entire } = makePlugin({ rateLimitingScope: 'entireMatch' });
  entire.isBlocking = false;
  assert(entire.shouldApplyRateLimit(), 'true for entireMatch even when not blocking');

  const { plugin: periodic } = makePlugin({ rateLimitingScope: 'blockingPeriodOnly' });
  periodic.isBlocking = false;
  assert(!periodic.shouldApplyRateLimit(), 'false for blockingPeriodOnly when not blocking');
  periodic.isBlocking = true;
  assert(periodic.shouldApplyRateLimit(), 'true for blockingPeriodOnly when blocking');
}

// ─── handleRoundEnd ──────────────────────────────────────────────────────────

console.log('\n--- handleRoundEnd ---');
{
  installMockTimers();
  const { plugin } = makePlugin({ rateLimitingScope: 'blockingPeriodOnly' });
  plugin.playerAttempts.set('steam1', 5);

  plugin.handleRoundEnd();

  assert(plugin.isBlocking, 'isBlocking = true');
  assert(plugin.isRoundEnding, 'isRoundEnding = true');
  assert(plugin.playerAttempts.size === 0, 'rate limiting data cleared for blockingPeriodOnly');
  restoreTimers();
}
{
  installMockTimers();
  const { plugin } = makePlugin({ rateLimitingScope: 'entireMatch' });
  plugin.playerAttempts.set('steam1', 5);

  plugin.handleRoundEnd();

  assert(plugin.playerAttempts.size === 1, 'rate limiting data preserved for entireMatch');
  restoreTimers();
}

// ─── handleNewGame: timer leak fix ───────────────────────────────────────────

console.log('\n--- handleNewGame: timer leak fix ---');
{
  const cleared = installMockTimers();
  const server = makeMockServer();
  const { plugin } = makePlugin({}, server);

  await plugin.handleNewGame();
  const firstId = plugin.blockTimeoutId;
  assert(firstId != null, 'blockTimeoutId set after first call');

  await plugin.handleNewGame();
  assert(cleared.has(firstId), 'first blockTimeoutId cleared on second handleNewGame');
  assert(plugin.blockTimeoutId !== firstId, 'blockTimeoutId updated to new timer');
  restoreTimers();
}

// ─── handleNewGame: broadcast leak fix ───────────────────────────────────────

console.log('\n--- handleNewGame: broadcast leak fix ---');
{
  const cleared = installMockTimers();
  const server = makeMockServer();
  const { plugin } = makePlugin({ broadcastMode: true, blockDuration: 30 }, server);

  await plugin.handleNewGame();
  const firstBroadcastIds = [...plugin.broadcastTimeouts];
  assert(firstBroadcastIds.length > 0, 'broadcasts scheduled after first call');

  await plugin.handleNewGame();
  assert(
    firstBroadcastIds.every(id => cleared.has(id)),
    'all previous broadcast timeouts cleared before rescheduling'
  );
  restoreTimers();
}

// ─── handleSquadCreated: allow logic ─────────────────────────────────────────

console.log('\n--- handleSquadCreated: allow logic ---');
{
  installMockTimers();
  const server = makeMockServer();
  const { plugin } = makePlugin({}, server);
  plugin.isBlocking = false;

  await plugin.handleSquadCreated({ player: { steamID: 'steam1', teamID: 1, squadID: 2 }, squadName: 'Alpha' });
  assert(server.calls.executes.length === 0, 'no disband when not blocking and no cooldown');
  restoreTimers();
}
{
  installMockTimers();
  const server = makeMockServer();
  const { plugin } = makePlugin({ squadWhitelist: ['Alpha'] }, server);
  plugin.isBlocking = true;

  await plugin.handleSquadCreated({ player: { steamID: 'steam1', teamID: 1, squadID: 2 }, squadName: 'Alpha' });
  assert(server.calls.executes.length === 0, 'whitelisted name passes through even when blocking');
  restoreTimers();
}
{
  installMockTimers();
  const server = makeMockServer();
  const { plugin } = makePlugin({ allowDefaultSquadNames: true }, server);
  plugin.isBlocking = true;

  await plugin.handleSquadCreated({ player: { steamID: 'steam1', teamID: 1, squadID: 2 }, squadName: 'Squad 1' });
  assert(server.calls.executes.length === 0, 'default name passes through when allowDefaultSquadNames=true');
  restoreTimers();
}

// ─── handleSquadCreated: block + warn ────────────────────────────────────────

console.log('\n--- handleSquadCreated: disband + warn ---');
{
  installMockTimers();
  const server = makeMockServer();
  const { plugin } = makePlugin({ enableRateLimiting: false, broadcastMode: false }, server);
  plugin.isBlocking = true;
  plugin.blockEndTime = Date.now() + 12000;

  await plugin.handleSquadCreated({ player: { steamID: 'steam1', teamID: 1, squadID: 2 }, squadName: 'Custom' });
  assert(server.calls.executes.some(cmd => cmd.includes('AdminDisbandSquad 1 2')), 'squad disbanded');
  assert(server.calls.warns.some(w => w.steamID === 'steam1' && w.msg.includes('wait')), 'player warned with time remaining');
  restoreTimers();
}
{
  installMockTimers();
  const server = makeMockServer();
  const { plugin } = makePlugin({ enableRateLimiting: false }, server);
  plugin.isBlocking = true;
  plugin.isRoundEnding = true;

  await plugin.handleSquadCreated({ player: { steamID: 'steam1', teamID: 1, squadID: 2 }, squadName: 'Custom' });
  assert(server.calls.warns.some(w => w.msg.includes('end of a round')), 'round-ending message used at round end');
  restoreTimers();
}
{
  installMockTimers();
  const server = makeMockServer();
  const { plugin } = makePlugin({ enableRateLimiting: false, broadcastMode: true }, server);
  plugin.isBlocking = true;
  plugin.blockEndTime = Date.now() + 10000;

  await plugin.handleSquadCreated({ player: { steamID: 'steam1', teamID: 1, squadID: 2 }, squadName: 'Custom' });
  assert(server.calls.executes.some(cmd => cmd.includes('AdminDisbandSquad')), 'squad disbanded in broadcast mode');
  assert(server.calls.warns.length === 0, 'no individual warn in broadcast mode');
  restoreTimers();
}

// ─── processRateLimit: warning ramp ──────────────────────────────────────────

console.log('\n--- processRateLimit: warning ramp ---');
{
  installMockTimers();
  const server = makeMockServer();
  const { plugin } = makePlugin({ warningThreshold: 3, kickThreshold: 10 }, server);

  await plugin.processRateLimit('steam1');
  assert(plugin.playerAttempts.get('steam1') === 1, 'attempt count = 1');
  assert(server.calls.warns.some(w => w.msg.includes('3 more attempt')), 'warns "3 more attempts" on attempt 1');

  server.calls.warns = [];
  await plugin.processRateLimit('steam1');
  assert(server.calls.warns.some(w => w.msg.includes('2 more attempt')), 'warns "2 more attempts" on attempt 2');

  server.calls.warns = [];
  await plugin.processRateLimit('steam1');
  assert(server.calls.warns.some(w => w.msg.includes('1 more attempt')), 'warns "1 more attempt" on attempt 3');
  restoreTimers();
}

// ─── processRateLimit: cooldown trigger ──────────────────────────────────────

console.log('\n--- processRateLimit: cooldown trigger ---');
{
  installMockTimers();
  const server = makeMockServer();
  const { plugin } = makePlugin({ warningThreshold: 3, cooldownDuration: 10, kickThreshold: 20 }, server);

  for (let i = 0; i < 3; i++) await plugin.processRateLimit('steam1');
  server.calls.warns = [];

  await plugin.processRateLimit('steam1'); // attempt 4 → cooldown
  assert(plugin.playerCooldowns.has('steam1'), 'cooldown map populated on attempt 4');
  assert(server.calls.warns.some(w => w.msg.includes('cooldown for 10s')), 'cooldown message sent');
  restoreTimers();
}

// ─── processRateLimit: resetOnAttempt=false ──────────────────────────────────

console.log('\n--- processRateLimit: resetOnAttempt=false ---');
{
  installMockTimers();
  const server = makeMockServer();
  const { plugin } = makePlugin({ warningThreshold: 2, cooldownDuration: 30, kickThreshold: 20, resetOnAttempt: false }, server);

  for (let i = 0; i < 3; i++) await plugin.processRateLimit('steam1');
  const originalEnd = plugin.playerCooldowns.get('steam1');
  server.calls.warns = [];

  await plugin.processRateLimit('steam1');
  assert(plugin.playerCooldowns.get('steam1') === originalEnd, 'cooldown end time unchanged');
  assert(!server.calls.warns.some(w => w.msg.includes('cooldown for')), 'no new cooldown message');
  restoreTimers();
}

// ─── processRateLimit: resetOnAttempt=true ───────────────────────────────────

console.log('\n--- processRateLimit: resetOnAttempt=true ---');
{
  installMockTimers();
  const server = makeMockServer();
  const { plugin } = makePlugin({ warningThreshold: 2, cooldownDuration: 30, kickThreshold: 20, resetOnAttempt: true }, server);

  for (let i = 0; i < 3; i++) await plugin.processRateLimit('steam1');
  const originalEnd = plugin.playerCooldowns.get('steam1');
  server.calls.warns = [];

  await new Promise(r => realTimers.setTimeout(r, 2)); // ensure Date.now() advances
  await plugin.processRateLimit('steam1');
  assert(plugin.playerCooldowns.get('steam1') > originalEnd, 'cooldown end time extended');
  assert(server.calls.warns.some(w => w.msg.includes('cooldown for')), 'new cooldown message sent');
  restoreTimers();
}

// ─── processRateLimit: kick ───────────────────────────────────────────────────

console.log('\n--- processRateLimit: kick threshold ---');
{
  installMockTimers();
  const server = makeMockServer();
  const { plugin } = makePlugin({ kickThreshold: 5, warningThreshold: 3 }, server);

  for (let i = 0; i < 4; i++) await plugin.processRateLimit('steam1');
  server.calls.executes = [];
  await plugin.processRateLimit('steam1'); // attempt 5 → kick

  assert(server.calls.executes.some(cmd => cmd.includes('AdminKick')), 'player kicked at threshold');
  assert(!plugin.playerAttempts.has('steam1'), 'player data cleared after kick');
  assert(!plugin.playerCooldowns.has('steam1'), 'cooldown cleared after kick');
  restoreTimers();
}

// ─── pollSquads: concurrency guard ───────────────────────────────────────────

console.log('\n--- pollSquads: concurrency guard ---');
{
  installMockTimers();
  let getSquadsCalls = 0;
  const server = makeMockServer();
  server.rcon.getSquads = async () => { getSquadsCalls++; return []; };
  const { plugin } = makePlugin({ enableRateLimiting: true, rateLimitingScope: 'entireMatch' }, server);

  plugin.isPollRunning = true;
  await plugin.pollSquads();

  assert(getSquadsCalls === 0, 'getSquads not called when poll already running');
  restoreTimers();
}

// ─── pollSquads: new squad disbanding ────────────────────────────────────────

console.log('\n--- pollSquads: disbands new squads during blocking ---');
{
  installMockTimers();
  const server = makeMockServer();
  server.rcon.getSquads = async () => [
    { teamID: 1, squadID: 2, squadName: 'Custom Squad', creatorSteam: 'steam1' }
  ];
  const { plugin } = makePlugin(
    { enableRateLimiting: true, rateLimitingScope: 'blockingPeriodOnly', warningThreshold: 3, kickThreshold: 20 },
    server
  );
  plugin.isBlocking = true;

  await plugin.pollSquads();

  assert(server.calls.executes.some(cmd => cmd.includes('AdminDisbandSquad 1 2')), 'new custom squad disbanded during blocking');
  assert(server.calls.warns.some(w => w.steamID === 'steam1'), 'creator warned via rate limiter');
  restoreTimers();
}
{
  installMockTimers();
  const server = makeMockServer();
  server.rcon.getSquads = async () => [
    { teamID: 1, squadID: 2, squadName: 'Squad 1', creatorSteam: 'steam1' }
  ];
  const { plugin } = makePlugin(
    { enableRateLimiting: true, rateLimitingScope: 'blockingPeriodOnly', allowDefaultSquadNames: true },
    server
  );
  plugin.isBlocking = true;

  await plugin.pollSquads();

  assert(server.calls.executes.length === 0, 'default squad name not disbanded during blocking when allowDefaultSquadNames=true');
  restoreTimers();
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
