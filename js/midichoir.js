/* global forceSATB, MIDI, muteSATB, eventjs */

var forceSATB = [0, 0, 0, 0];
var muteSATB = [0, 0, 0, 0];
var bookmarkTime = 0;
var Instrument = "acoustic_grand_piano"; //"acoustic_grand_piano"
// "accordion"

window.onload = function () {

    MIDI.loadPlugin({
        soundfontUrl: "./soundfont/",
        instrument: Instrument,
        //targetFormat: 'mp3', // mp3 / ogg
        //api: 'webaudio', // audiotag / webmidi / webaudio
        onprogress: function (state, progress) {
            console.log(state, progress);
            var x = document.getElementById("message");
            x.innerHTML = "Status : " + state + " " + Math.floor(progress*100) + "%";
        },
        onsuccess: function () { configureMidi();
                                 loaded(); 
                             }
    });
};

function loaded() {
    console.log("loaded");
    $(".loader").css({"display": "none"});
    $(".loadable").css({"visibility": "visible"});
}

function configureMidi() {
    var x = document.getElementById("plugin");
    x.innerHTML = "Plugin : " + MIDI.api;
    var x = document.getElementById("format");
    x.innerHTML = "Format : " + MIDI.__audioFormat;
    /// this sets up the MIDI.Player and gets things going...
    var instrumentNumber = MIDI.GM.byName[Instrument].number;
    MIDI.programChange(0, instrumentNumber);
    MIDI.programChange(1, instrumentNumber);
    MIDI.programChange(2, instrumentNumber);
    MIDI.programChange(3, instrumentNumber);
}
;

function loadMusic() {
    console.log(MIDI.api);
    var x = document.getElementById("musicSelect").value;
    MIDI.Player.loadFile("../mid/" + x, MIDI.Player.start);
    bookmarkTime = 0;
    $("#bookmark").css({"visibility": "hidden"});
    MIDIPlayerPercentage(MIDI.Player);
}
;

function setBookmark() {
    bookmarkTime = MIDI.Player.currentTime;
    console.log(bookmarkTime);
    $("#bookmark").css({"visibility": "visible"});
    $("#bookmark").css({"left": 420*bookmarkTime/MIDI.Player.endTime});
}
;

function backToBookmark() {
    var d = document.getElementById("pausePlayStop");
    d.src = "../images/media_pause.png";
    MIDI.Player.stop();
    MIDI.Player.currentTime = bookmarkTime;
    MIDI.Player.resume();
}
;

var pausePlayStop = function (stop) {
    var d = document.getElementById("pausePlayStop");
    if (stop) {
        MIDI.Player.stop();
        d.src = "../images/media_play.png";
    } else if (MIDI.Player.playing) {
        d.src = "../images/media_play.png";
        MIDI.Player.pause(true);
    } else {
        d.src = "../images/media_pause.png";
        MIDI.Player.resume();
    }
};

var MIDIPlayerPercentage = function (player) {
    // update the timestamp
    var time1 = document.getElementById("time1");
    var time2 = document.getElementById("time2");
    var capsule = document.getElementById("capsule");
    var timeCursor = document.getElementById("cursor");
    var wasPlaying = false;
    //
    eventjs.add(capsule, "drag", function (event, self) {
        eventjs.cancel(event);
        player.currentTime = (self.x) / 420 * player.endTime;
        if (player.currentTime < 0)
            player.currentTime = 0;
        if (player.currentTime > player.endTime)
            player.currentTime = player.endTime;
        if (self.state === "down") {
            wasPlaying = player.playing;
            if (wasPlaying)    
                pausePlayStop();
        } else if (self.state === "up" && wasPlaying) {
            pausePlayStop();
        }
    });
    //
    function timeFormatting(n) {
        var minutes = n / 60 >> 0;
        var seconds = String(n - (minutes * 60) >> 0);
        if (seconds.length === 1)
            seconds = "0" + seconds;
        return minutes + ":" + seconds;
    }
    ;

    player.setAnimation(function (data, element) {
        var percent = data.now / data.end;
        var now = data.now >> 0; // where we are now
        var end = data.end >> 0; // end of song
        // display the information to the user
        timeCursor.style.width = (percent * 100) + "%";
        time1.innerHTML = timeFormatting(now);
        time2.innerHTML = "-" + timeFormatting(end - now);
    });
};

function setAllVol() {
    // si au moins un bleu : on ne laisse que les bleu
    if (forceSATB.includes(1)) {
        for (i = 0; i < 4; i++) {
            if (forceSATB[i] === 1) {
                MIDI.setVolume(i, 127);
            } else {
                MIDI.setVolume(i, 0);
            }
        }
    }
    // si pas de bleu : on laisse tout sauf les rouges
    else {
        for (i = 0; i < 4; i++) {
            if (muteSATB[i] === 1) {
                MIDI.setVolume(i, 0);
            } else {
                MIDI.setVolume(i, 127);
            }
        }
    }
}
;

function forceChannel(channel) {
    var wasPlaying = MIDI.Player.playing;
    console.log("Force channel " + channel);
    muteSATB[channel] = 0;
    $("#btnMute" + channel).css({"background-color": ""});
    if (forceSATB[channel] === 0) {
        forceSATB[channel] = 1;
        $("#btnForce" + channel).css({"background-color": "#00ffe1"});
    } else {
        forceSATB[channel] = 0;
        $("#btnForce" + channel).css({"background-color": ""});
    }
    console.log(forceSATB);
    MIDI.Player.pause();
    setAllVol();
    if (wasPlaying)
        MIDI.Player.resume();
}
;

function muteChannel(channel) {
    console.log("Mute channel " + channel);
    var wasPlaying = MIDI.Player.playing;
    forceSATB[channel] = 0;
    $("#btnForce" + channel).css({"background-color": ""});
    if (muteSATB[channel] === 0) {
        muteSATB[channel] = 1;
        $("#btnMute" + channel).css({"background-color": "#ff00dc"});
    } else {
        muteSATB[channel] = 0;
        $("#btnMute" + channel).css({"background-color": ""});
    }
    console.log(muteSATB);
    MIDI.Player.pause();
    setAllVol();
    if (wasPlaying)
        MIDI.Player.resume();
}
;