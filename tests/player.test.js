const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const playerSource = fs.readFileSync(path.join(__dirname, '../inc/midi/player.js'), 'utf8');

function createPlayer(events, soundfontReady = false) {
    let currentTime = 0;
    let nextIntervalId = 1;
    const intervals = new Map();
    const calls = [];
    const sources = [];
    let pluginLoads = 0;
    const context = { get currentTime() { return currentTime; } };
    const midi = {
        api: 'webaudio',
        Soundfont: soundfontReady ? { acoustic_grand_piano: { isLoaded: true } } : {},
        channels: [{ mute: false }],
        WebAudio: { getContext: () => context },
        loadPlugin: ({ onsuccess }) => { pluginLoads++; if (onsuccess) onsuccess(); },
        setController: () => {},
        programChange: () => {},
        pitchBend: () => {},
        noteOn: (channel, note, velocity, delay) => {
            const source = {
                disconnected: false,
                disconnect() { this.disconnected = true; },
                stop() { this.stopped = true; }
            };
            sources.push(source);
            calls.push({ type: 'on', note, delay });
            return source;
        },
        noteOff: (channel, note, delay) => calls.push({ type: 'off', note, delay })
    };
    const window = {
        performance: { now: () => currentTime * 1000 },
        setInterval(callback) {
            const id = nextIntervalId++;
            intervals.set(id, callback);
            return id;
        },
        clearInterval: id => intervals.delete(id),
        clearTimeout: () => {},
        setTimeout: () => { throw new Error('Per-note timers are not expected'); }
    };
    vm.runInNewContext(playerSource, {
        MIDI: midi,
        window,
        MidiFile: () => ({}),
        Replayer: function () { this.getData = () => events; },
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {}
    });
    midi.Player.currentData = '';
    midi.Player.loadMidiFile();

    return {
        player: midi.Player,
        calls,
        sources,
        intervals,
        get pluginLoads() { return pluginLoads; },
        tick(seconds) {
            currentTime = seconds;
            for (const callback of [...intervals.values()]) callback();
        }
    };
}

test('starts a new MIDI track without reloading an already decoded soundfont', () => {
    const harness = createPlayer([], true);
    let started = false;
    harness.player.loadMidiFile(() => { started = true; });
    assert.equal(started, true);
    assert.equal(harness.pluginLoads, 0);
});

test('schedules each event once in a bounded lookahead window', () => {
    const harness = createPlayer([
        [{ event: { type: 'channel', subtype: 'noteOn', channel: 0, noteNumber: 60, velocity: 100 } }, 100],
        [{ event: { type: 'channel', subtype: 'noteOff', channel: 0, noteNumber: 60 } }, 100],
        [{ event: { type: 'channel', subtype: 'noteOn', channel: 0, noteNumber: 62, velocity: 100 } }, 400]
    ]);

    harness.player.start();
    assert.deepEqual(harness.calls.map(call => call.type), ['on', 'off']);
    assert.equal(harness.intervals.size, 1);
    harness.tick(0.2);
    assert.equal(harness.calls.length, 2);
    harness.tick(0.4);
    assert.deepEqual(harness.calls.map(call => call.note), [60, 60, 62]);
    assert.equal(harness.calls[2].delay, 0.6005);
    harness.tick(0.5);
    assert.equal(harness.calls.length, 3);
});

test('pause cancels scheduled sources and resume continues from the playhead', () => {
    const harness = createPlayer([
        [{ event: { type: 'channel', subtype: 'noteOn', channel: 0, noteNumber: 60, velocity: 100 } }, 100],
        [{ event: { type: 'channel', subtype: 'noteOn', channel: 0, noteNumber: 62, velocity: 100 } }, 500]
    ]);

    harness.player.start();
    harness.tick(0.3);
    harness.player.pause();
    assert.equal(harness.player.currentTime, 300);
    assert.equal(harness.intervals.size, 0);
    assert.equal(harness.sources[0].disconnected, true);
    harness.player.resume();
    harness.tick(0.36);
    assert.deepEqual(harness.calls.map(call => call.note), [60, 62]);
    assert.equal(harness.intervals.size, 1);
});

test('seeking starts at the first event at or after the selected time', () => {
    const harness = createPlayer([
        [{ event: { type: 'channel', subtype: 'noteOn', channel: 0, noteNumber: 60, velocity: 100 } }, 100],
        [{ event: { type: 'channel', subtype: 'noteOn', channel: 0, noteNumber: 62, velocity: 100 } }, 500]
    ]);

    harness.player.currentTime = 550;
    harness.player.start();
    assert.deepEqual(harness.calls.map(call => call.note), [62]);
    assert.equal(harness.calls[0].delay, 0.0505);
});
