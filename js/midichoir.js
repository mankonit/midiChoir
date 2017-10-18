/* global forceSATB, MIDI, muteSATB, eventjs */

var forceSATB = [];
var muteSATB = [];
var channels = [];
var bookmarkTime = 0;
var Instrument = "acoustic_grand_piano"; //"acoustic_grand_piano" // "accordion"
var tempoCorrection = 0;


window.onload = function () {
    MIDI.loadPlugin({
        soundfontUrl: "./soundfont/",
        instrument: Instrument,
        //targetFormat: 'mp3', // mp3 / ogg
        api: 'webaudio', // audiotag / webmidi / webaudio
        onprogress: function (state, progress) {
            console.log(state, progress);
            var x = document.getElementById("message");
            x.innerHTML = "Status : " + state + " " + Math.floor(progress * 100) + "%";
        },
        onsuccess: function () {
            loaded();
        }
    });
};

function loaded() {
    console.log("loaded");
    $(".loader").css({"display": "none"});
    $(".loadable").css({"visibility": "visible"});
    var x = document.getElementById("plugin");
    x.innerHTML = "Plugin : " + MIDI.api;
    var x = document.getElementById("format");
    x.innerHTML = "Format : " + MIDI.__audioFormat;
    var x = document.getElementById("musicSelect");
    x.selectedIndex = 0;
}
;

function changeTrack() {
    document.getElementById("tempoSlide").value = 0;
    applyTempo();
    updateTempoLabel(0);
    loadMusic();
}
;
function loadMusic() {
    var htmlSelect = document.getElementById("musicSelect");
    var filename = htmlSelect.value;
    var htmlSelectedIndex = htmlSelect.selectedIndex;
    var htmlOptions = htmlSelect.options;
    var htmlSelectedOption = htmlOptions[htmlSelectedIndex];
    var channelsString = htmlSelectedOption.getAttribute("data-channels");
    channels = channelsString.split(".");
    console.log("Number of channels : " + channels.length);
    forceSATB = new Array(channels.length);
    forceSATB.fill(0);
    muteSATB = new Array(channels.length);
    muteSATB.fill(0);
    //
    configureMidi();
    //
    var htmlForceButtonsDiv = document.getElementById("forceButtonsDiv");
    var htmlMuteButtonsDiv = document.getElementById("muteButtonsDiv");
    htmlForceButtonsDiv.innerHTML = "";
    htmlMuteButtonsDiv.innerHTML = "";
    //
    for (i=0; i<channels.length; i++) {
        // Ajout boutton +
        var forceBut = document.createElement("button");
        forceBut.setAttribute("data-channel", i);
        var forceButText = document.createTextNode(channels[i] + "+");
        forceBut.id = "btnForce" + i;
        forceBut.onclick = function() { forceChannel(this.getAttribute("data-channel")); };
        forceBut.appendChild(forceButText);
        htmlForceButtonsDiv.appendChild(forceBut);
        // Ajout boutton -
        var muteBut = document.createElement("button");
        muteBut.setAttribute("data-channel", i);
        var muteButText = document.createTextNode(channels[i] + "-");
        muteBut.id = "btnMute" + i;
        muteBut.onclick = function() { muteChannel(this.getAttribute("data-channel")); };
        muteBut.appendChild(muteButText);
        htmlMuteButtonsDiv.appendChild(muteBut);
    }
    // Ajout de l'aide sur les boutons
    $("#btnForce0").attr("data-intro", "Isoler la voix");
    $("#btnForce0").attr("data-position", "left");
    $("#btnMute0").attr("data-intro", "Couper la voix");
    $("#btnMute0").attr("data-position", "left");
    //
    bookmarkTime = 0;
    setAllVol();
    $("#bookmark").css({"visibility": "hidden"});
    $("#tempoSlideDiv").css({"visibility": "visible"});
    $("#tempoLabel").attr("data-intro", "Ajustement du tempo");
    $("#tempoLabel").attr("data-position", "left");
    MIDI.Player.loadFile("../mid/" + filename, MIDI.Player.start);
    MIDIPlayerPercentage(MIDI.Player);
    var d = document.getElementById("pausePlayStop");
    d.src = "../images/media_pause.png";
}
;

function configureMidi() {
    var instrumentNumber = MIDI.GM.byName[Instrument].number;
    for (i=0; i<channels.length; i++) {
        MIDI.programChange(i, instrumentNumber);
    }
    //MIDI.noteOn(0,50,1,0);
}
;

function setBookmark() {
    bookmarkTime = MIDI.Player.currentTime;
    console.log(bookmarkTime);
    $("#bookmark").css({"visibility": "visible"});
    $("#bookmark").css({"left": 420 * bookmarkTime / MIDI.Player.endTime});
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
        for (i = 0; i < channels.length; i++) {
            if (forceSATB[i] === 1) {
                MIDI.setVolume(i, 127);
            } else {
                MIDI.setVolume(i, 20);
            }
        }
    }
    // si pas de bleu : tout au max
    else {
        for (i = 0; i < channels.length; i++) {
            MIDI.setVolume(i, 127);
        }
    }
    // On coupe les rouges
    for (i = 0; i < channels.length; i++) {
        if (muteSATB[i] === 1) {
            MIDI.setVolume(i, 0);
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

function updateTempoLabel(value) {
    var d = document.getElementById("tempoSpan");
    d.innerHTML = value + "%";
    if (value >= 0)
        d.innerHTML = "+" + d.innerHTML;
    var d = document.getElementById("tempoValidate");
    if (value != tempoCorrection) {
        d.src = "../images/ok_darkGreen.png";
    }
    else
        d.src = "../images/ok.png";
}
;

function applyTempo() {
    var newTempo = document.getElementById("tempoSlide").value;
    if (tempoCorrection != newTempo) {
        tempoCorrection = newTempo;
        console.log("Apply tempo : " + tempoCorrection + "%");
        MIDI.Player.timeWarp = 1 - tempoCorrection/100.0;
        loadMusic();
        updateTempoLabel(tempoCorrection);
    }
    var d = document.getElementById("tempoValidate");
    d.src = "../images/ok.png";
}
;