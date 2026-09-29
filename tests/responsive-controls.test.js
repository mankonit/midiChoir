const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/midichoir.js'), 'utf8');

test('seeking and bookmarks use the current progress bar width', () => {
    const capsule = { clientWidth: 200 };
    const bookmark = { style: {} };
    const player = {
        currentTime: 0,
        endTime: 100,
        playing: false,
        setAnimation() {}
    };
    let drag;
    const context = {
        document: {
            getElementById(id) {
                return { capsule, bookmark }[id] || {};
            }
        },
        MIDI: { Player: player },
        eventjs: {
            add(element, gesture, listener) {
                assert.equal(element, capsule);
                assert.equal(gesture, 'drag');
                drag = listener;
            },
            cancel() {}
        },
        $(selector) {
            assert.equal(selector, '#bookmark');
            return {
                css(properties) {
                    Object.assign(bookmark.style, properties);
                }
            };
        },
        console: { log() {} }
    };

    vm.runInNewContext(source, context);
    context.MIDIPlayerPercentage(player);
    drag({}, { state: 'move', x: 100 });
    assert.equal(player.currentTime, 50);

    capsule.clientWidth = 300;
    drag({}, { state: 'move', x: 75 });
    assert.equal(player.currentTime, 25);
    context.setBookmark();
    assert.equal(bookmark.style.left, 75);
});
