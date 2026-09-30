const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const detectSource = fs.readFileSync(path.join(__dirname, '../inc/midi/audioDetect.js'), 'utf8');
const webAudioSource = fs.readFileSync(path.join(__dirname, '../inc/midi/plugin.webaudio.js'), 'utf8');
const loaderSource = fs.readFileSync(path.join(__dirname, '../inc/midi/loader.js'), 'utf8');

test('changes the master gain immediately and keeps it when the audio context changes', () => {
    const gains = [];
    const audioContext = {
        destination: {},
        createGain() {
            const node = { gain: {}, connect() {} };
            gains.push(node);
            return node;
        }
    };
    const midi = { keyToNote: {}, Soundfont: {} };
    vm.runInNewContext(webAudioSource, {
        MIDI: midi,
        window: { AudioContext: function () {} },
        setTimeout() {}
    });

    midi.WebAudio.setContext(audioContext);
    assert.equal(gains[0].gain.value, 1);
    midi.WebAudio.setMasterVolume(0.4);
    assert.equal(gains[0].gain.value, 0.4);
    midi.WebAudio.setMasterVolume(1.2);
    assert.equal(gains[0].gain.value, 1.2);
    midi.WebAudio.setMasterVolume(2);
    assert.equal(gains[0].gain.value, 1.2);
    midi.WebAudio.setMasterVolume(0);
    assert.equal(gains[0].gain.value, 0);
    midi.WebAudio.setContext(audioContext);
    assert.equal(gains[1].gain.value, 0);
});
const base64Source = fs.readFileSync(path.join(__dirname, '../inc/shim/Base64binary.js'), 'utf8');

test('decodes Ogg soundfont samples without trailing padding bytes', () => {
    const context = {};
    vm.runInNewContext(base64Source, context);

    for (const name of ['electric_piano_1', 'acoustic_grand_piano', 'xylophone']) {
        const source = fs.readFileSync(path.join(__dirname, '../html/soundfont', name + '-ogg.js'), 'utf8');
        const samples = [...source.matchAll(/data:audio\/[^,]+,([A-Za-z0-9+/=]+)/g)];
        assert.ok(samples.length > 0, name + ' has no audio samples');

        for (const [, encoded] of samples) {
            const actual = Buffer.from(context.Base64Binary.decodeArrayBuffer(encoded));
            const expected = Buffer.from(encoded, 'base64');
            assert.deepEqual(actual, expected);
            assert.equal(actual.subarray(0, 4).toString(), 'OggS');
        }
    }
});

test('uses the advertised Ogg support when mobile audio never reaches canplaythrough', () => {
    let now = 0;
    let poll;
    let supported;
    const context = {
        MIDI: {},
        navigator: {},
        Date: class { getTime() { return now; } },
        Audio: class {
            canPlayType(type) { return type.startsWith('audio/ogg') ? 'probably' : 'maybe'; }
            setAttribute() {}
            addEventListener() {}
        },
        document: { body: { appendChild() {}, removeChild() {} } },
        window: {
            AudioContext: function () {},
            setInterval(callback) { poll = callback; return 1; },
            clearInterval() {}
        }
    };

    vm.runInNewContext(detectSource, context);
    context.MIDI.audioDetect(result => { supported = result; });
    now = 5001;
    poll();
    assert.equal(supported['audio/ogg'], true);
    assert.equal(supported.webaudio, true);
});

test('reports a soundfont decode failure once and does not report loading success', () => {
    const error = new Error('Unsupported audio data');
    let failures = 0;
    let successes = 0;
    const timers = [];
    const decodes = [];
    const audioContext = {
        destination: {},
        createGain() { return { gain: {}, connect() {} }; },
        decodeAudioData(buffer, onload, onerror) { decodes.push({ onload, onerror }); }
    };
    const midi = {
        Soundfont: { acoustic_grand_piano: { C4: 'data:audio/ogg;base64,AA==', D4: 'data:audio/ogg;base64,AA==' } },
        keyToNote: { C4: 60, D4: 62 },
        GM: { byName: { acoustic_grand_piano: { number: 0 } } },
        channels: [],
        setDefaultPlugin(plugin) { Object.assign(this, plugin); }
    };
    const context = {
        MIDI: midi,
        window: { AudioContext: function () { return audioContext; } },
        Base64Binary: { decodeArrayBuffer() { return new ArrayBuffer(1); } },
        setTimeout(callback) { timers.push(callback); }
    };

    vm.runInNewContext(webAudioSource, context);
    midi.WebAudio.connect({
        onsuccess() { successes++; },
        onerror(received, stage) { assert.equal(received, error); assert.equal(stage, 'decode'); failures++; }
    });
    assert.equal(decodes.length, 2);
    decodes[0].onerror(error);
    decodes[1].onload({});
    timers.forEach(callback => callback());
    assert.equal(failures, 1);
    assert.equal(successes, 0);
    assert.equal(Object.keys(midi.WebAudio.audioBuffers).length, 0);
});

test('handles rejected decodeAudioData promises', async () => {
    const error = new Error('Unsupported audio data');
    let failure;
    const audioContext = {
        destination: {},
        createGain() { return { gain: {}, connect() {} }; },
        decodeAudioData() { return Promise.reject(error); }
    };
    const midi = {
        Soundfont: { acoustic_grand_piano: { C4: 'data:audio/ogg;base64,AA==' } },
        keyToNote: { C4: 60 },
        GM: { byName: { acoustic_grand_piano: { number: 0 } } },
        setDefaultPlugin(plugin) { Object.assign(this, plugin); }
    };
    vm.runInNewContext(webAudioSource, {
        MIDI: midi,
        window: { AudioContext: function () { return audioContext; } },
        Base64Binary: { decodeArrayBuffer() { return new ArrayBuffer(1); } },
        setTimeout() {}
    });
    midi.WebAudio.connect({ onerror(received) { failure = received; } });
    await new Promise(setImmediate);
    assert.equal(failure, error);
});

function createLoader(failMp3) {
    const requests = [];
    const errors = [];
    let successes = 0;
    const decodeError = new Error('Ogg decode failed');
    const midi = {
        Soundfont: {},
        keyToNote: { C4: 60 },
        GM: { byName: { acoustic_grand_piano: { number: 0 } } },
        audioDetect(callback) { callback({ webaudio: true, 'audio/ogg': true, 'audio/mpeg': true }); },
        WebAudio: {
            audioBuffers: { '060': 'old Ogg buffer', '160': 'unrelated buffer' },
            connect(opts) {
                if (opts.format === 'ogg' || failMp3) opts.onerror(decodeError, 'decode');
                else { successes++; opts.onsuccess(); }
            }
        },
        util: {
            request(opts) {
                requests.push(opts.url);
                const match = opts.url.match(/([^/]+)-(ogg|mp3)\.js$/);
                midi.Soundfont[match[1]] = { format: match[2] };
                opts.onsuccess({}, '');
            }
        }
    };
    const context = {
        MIDI: midi,
        window: { location: { hash: '' }, AudioContext: function () {} },
        document: { createElement() { return {}; }, body: { appendChild() {} } }
    };
    vm.runInNewContext(loaderSource, context);
    midi.loadPlugin({
        api: 'webaudio',
        instrument: 'acoustic_grand_piano',
        onsuccess() {},
        onerror(error) { errors.push(error); }
    });
    return { midi, requests, errors, get successes() { return successes; } };
}

test('retries failed Ogg decoding with MP3 and removes stale Ogg buffers', () => {
    const result = createLoader(false);
    assert.deepEqual(result.requests, [
        './soundfont/acoustic_grand_piano-ogg.js',
        './soundfont/acoustic_grand_piano-mp3.js'
    ]);
    assert.equal(result.midi.__audioFormat, 'mp3');
    assert.equal(result.midi.Soundfont.acoustic_grand_piano.format, 'mp3');
    assert.equal(result.midi.WebAudio.audioBuffers['060'], undefined);
    assert.equal(result.midi.WebAudio.audioBuffers['160'], 'unrelated buffer');
    assert.equal(result.successes, 1);
    assert.equal(result.errors.length, 0);
});

test('reports an MP3 decode failure without retrying again', () => {
    const result = createLoader(true);
    assert.equal(result.requests.length, 2);
    assert.equal(result.successes, 0);
    assert.equal(result.errors.length, 1);
});
