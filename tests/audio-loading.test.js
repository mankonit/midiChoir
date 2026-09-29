const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const detectSource = fs.readFileSync(path.join(__dirname, '../inc/midi/audioDetect.js'), 'utf8');
const webAudioSource = fs.readFileSync(path.join(__dirname, '../inc/midi/plugin.webaudio.js'), 'utf8');

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
    const audioContext = {
        destination: {},
        createGain() { return { gain: {}, connect() {} }; },
        decodeAudioData(buffer, onload, onerror) { onerror(error); }
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
        onerror(received) { assert.equal(received, error); failures++; }
    });
    timers.forEach(callback => callback());
    assert.equal(failures, 1);
    assert.equal(successes, 0);
});
