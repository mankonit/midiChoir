/* global forceSATB, MIDI, muteSATB, eventjs */

var playBeat = false;
var playAcc = true;
var forceSATB = [];
var muteSATB = [];
var channels = [];
var bookmarkTime = 0;
var Instrument;
var InstrumentBeat = "xylophone";
var InstrumentAccompaniment;
var accVolume;
var setId;
var tempoCorrection = 0;

window.onload = function () {
    MIDI.loadPlugin({
        soundfontUrl: "./soundfont/",
        instruments: ["electric_piano_1", "acoustic_grand_piano", "xylophone"],
        //targetFormat: 'mp3', // mp3 / ogg
        api: 'webaudio', // audiotag / webmidi / webaudio
        onprogress: function (state, progress) {
            console.log(state, progress);
            document.getElementById("message").innerHTML = "Status : " + state + " " + Math.floor(progress * 100) + "%";
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
    document.getElementById("plugin").innerHTML = "Plugin : " + MIDI.api;
    document.getElementById("format").innerHTML = "Format : " + MIDI.__audioFormat;
    document.getElementById("musicSelect").selectedIndex = 0;
    checkCookieInstrumentSet();
}
;

function changeTrack() {
    document.getElementById("tempoSlide").value = 0;
    applyTempo();
    updateTempoLabel(0);
    loadMusic();
}
;

function changeInstrumentSet() {
    setId = parseInt(document.getElementById("instrumentSelect").value);
    setCookie("setId", setId, 3650);
    loadMusic();
}
;

function applyInstrumentSet() {
    console.log("applyInstrumentSet : " + setId);
    switch (setId) {
        case 0:
            Instrument = "electric_piano_1";
            InstrumentAccompaniment = "acoustic_grand_piano";
            accVolume = 10;
            break;
        case 1:
            Instrument = "acoustic_grand_piano";
            InstrumentAccompaniment = "electric_piano_1";
            accVolume = 15;
            break;
        default:
            Instrument = "electric_piano_1";
            InstrumentAccompaniment = "acoustic_grand_piano";
            accVolume = 10;
            break;
    }
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
    var beatPresentString = htmlSelectedOption.getAttribute("data-beat");
    if (beatPresentString === "1") {
        $("#playBeatDiv").css({"display": "block"});
    } else {
        $("#playBeatDiv").css({"display": "none"});
    }
    var accPresentString = htmlSelectedOption.getAttribute("data-acc");
    if (accPresentString === "1") {
        $("#playAccDiv").css({"display": "block"});
    } else {
        $("#playAccDiv").css({"display": "none"});
    }
    //
    applyInstrumentSet();
    configureMidi();
    //
    var htmlForceButtonsDiv = document.getElementById("forceButtonsDiv");
    var htmlMuteButtonsDiv = document.getElementById("muteButtonsDiv");
    htmlForceButtonsDiv.innerHTML = "";
    htmlMuteButtonsDiv.innerHTML = "";
    //
    for (i = 0; i < channels.length; i++) {
        // Ajout boutton +
        var forceBut = document.createElement("button");
        forceBut.setAttribute("data-channel", i);
        var forceButText = document.createTextNode(channels[i] + "+");
        forceBut.id = "btnForce" + i;
        forceBut.onclick = function () {
            forceChannel(this.getAttribute("data-channel"));
        };
        forceBut.appendChild(forceButText);
        htmlForceButtonsDiv.appendChild(forceBut);
        // Ajout boutton -
        var muteBut = document.createElement("button");
        muteBut.setAttribute("data-channel", i);
        var muteButText = document.createTextNode(channels[i] + "-");
        muteBut.id = "btnMute" + i;
        muteBut.onclick = function () {
            muteChannel(this.getAttribute("data-channel"));
        };
        muteBut.appendChild(muteButText);
        htmlMuteButtonsDiv.appendChild(muteBut);
    }

    // on décoche le play beat
    playBeat = false;
    $("#playBeat2").prop("src", "../images/metronome_black_48.png");

    // on active le play acc
    playAcc = true;
    $("#playAcc").prop("src", "../images/violin_green_64.png");

    // Ajout de l'aide sur les boutons
    $("#btnForce0").attr("data-intro", "Isoler la voix");
    $("#btnForce0").attr("data-position", "left");
    $("#btnMute0").attr("data-intro", "Couper la voix");
    $("#btnMute0").attr("data-position", "left");
    //
    bookmarkTime = 0;
    setAllVol();
    setBeatVol();
    setAccVol();
    $("#bookmark").css({"visibility": "hidden"});
    $("#tempoSlideDiv").css({"visibility": "visible"});
    $("#playBeatDiv").css({"visibility": "visible"});
    $("#playAccDiv").css({"visibility": "visible"});
    $("#tempoLabel").attr("data-intro", "Ajustement du tempo");
    $("#tempoLabel").attr("data-position", "left");
    MIDI.Player.loadFile("../mid/" + filename, MIDI.Player.start);
    MIDIPlayerPercentage(MIDI.Player);
    document.getElementById("pausePlayStop").src = "../images/media_pause.png";
}
;

function configureMidi() {
    var instrumentNumber = MIDI.GM.byName[Instrument].number;
    for (i = 0; i < channels.length; i++) {
        MIDI.programChange(i, instrumentNumber);
    }
    // Pour le channel beat tempo
    MIDI.programChange(12, MIDI.GM.byName[InstrumentBeat].number);
    // Pour l'accompagnement
    MIDI.programChange(14, MIDI.GM.byName[InstrumentAccompaniment].number);
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
                MIDI.setVolume(i, 80);
            } else {
                MIDI.setVolume(i, 15);
            }
        }
    }
    // si pas de bleu : tout au max
    else {
        for (i = 0; i < channels.length; i++) {
            MIDI.setVolume(i, 80);
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

function setBeatVol() {
    console.log("setBeatVol : " + playBeat);
    if (playBeat) {
        MIDI.setVolume(12, 127);
    } else {
        MIDI.setVolume(12, 0);
    }
}
;

function setAccVol() {
    console.log("setAccVol : " + playAcc + " - Volume : " + accVolume);
    if (playAcc) {
        MIDI.setVolume(14, accVolume);
    } else {
        MIDI.setVolume(14, 0);
    }
}
;

function changePlayBeat() {
    if (playBeat) {
        // il était actif ==> on désactive
        playBeat = false;
        $("#playBeat2").prop("src", "../images/metronome_black_48.png");
    } else {
        playBeat = true;
        $("#playBeat2").prop("src", "../images/metronome_green_48.png");
    }
    var wasPlaying = MIDI.Player.playing;
    MIDI.Player.pause();
    setBeatVol();
    if (wasPlaying)
        MIDI.Player.resume();
}
;

function changePlayAcc() {
    if (playAcc) {
        // il était actif ==> on désactive
        playAcc = false;
        $("#playAcc").prop("src", "../images/violin_black_64.png");
    } else {
        playAcc = true;
        $("#playAcc").prop("src", "../images/violin_green_64.png");
    }
    var wasPlaying = MIDI.Player.playing;
    MIDI.Player.pause();
    setAccVol();
    if (wasPlaying)
        MIDI.Player.resume();
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
    } else
        d.src = "../images/ok.png";
}
;

function applyTempo() {
    var newTempo = document.getElementById("tempoSlide").value;
    if (tempoCorrection != newTempo) {
        tempoCorrection = newTempo;
        console.log("Apply tempo : " + tempoCorrection + "%");
        MIDI.Player.timeWarp = 1 - tempoCorrection / 100.0;
        loadMusic();
        updateTempoLabel(tempoCorrection);
    }
    document.getElementById("tempoValidate").src = "../images/ok.png";
}
;

function setCookie(cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    var expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}
;

function getCookie(cname) {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}
;

function checkCookieInstrumentSet() {
    setId = parseInt(getCookie("setId"));
    console.log("checkCookieInstrumentSet : " + setId);
    if (!setId && setId !== 0) {
        console.log("Pas de cookie");
        setCookie("setId", 0, 3650);
    } else {
        document.getElementById("instrumentSelect").selectedIndex = parseInt(setId);
    }
}
;

/* Set the width of the side navigation to 250px */
function openNav() {
    document.getElementById("mySidenav").style.width = "250px";
}
;

/* Set the width of the side navigation to 0 */
function closeNav() {
    document.getElementById("mySidenav").style.width = "0";
}
;