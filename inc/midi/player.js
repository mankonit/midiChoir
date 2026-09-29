/*
	----------------------------------------------------------
	MIDI.Player : 0.3.1 : 2015-03-26
	----------------------------------------------------------
	https://github.com/mudcube/MIDI.js
	----------------------------------------------------------
*/

if (typeof MIDI === 'undefined') MIDI = {};
if (typeof MIDI.Player === 'undefined') MIDI.Player = {};

(function() { 'use strict';

var midi = MIDI.Player;
midi.currentTime = 0;
midi.endTime = 0; 
midi.restart = 0; 
midi.playing = false;
midi.timeWarp = 1;
midi.startDelay = 0;
//midi.BPM = 200;

midi.start =
midi.resume = function(onsuccess) {
    if (midi.currentTime < -1) {
    	midi.currentTime = -1;
    }
    startAudio(midi.currentTime, onsuccess);
};

midi.pause = function() {
	stopAudio();
};

midi.stop = function() {
	stopAudio();
	midi.restart = 0;
	midi.currentTime = 0;
};

midi.addListener = function(onsuccess) {
	onMidiEvent = onsuccess;
};

midi.removeListener = function() {
	onMidiEvent = undefined;
};

midi.clearAnimation = function() {
	if (midi.animationFrameId)  {
		cancelAnimationFrame(midi.animationFrameId);
	}
};

midi.setAnimation = function(callback) {
	var currentTime = 0;
	var tOurTime = 0;
	var tTheirTime = 0;
	//
	midi.clearAnimation();
	///
	var frame = function() {
		midi.animationFrameId = requestAnimationFrame(frame);
		///
		if (midi.endTime === 0) {
			return;
		}
		if (midi.playing) {
			currentTime = (tTheirTime === midi.currentTime) ? tOurTime - Date.now() : 0;
			if (midi.currentTime === 0) {
				currentTime = 0;
			} else {
				currentTime = midi.currentTime - currentTime;
			}
			if (tTheirTime !== midi.currentTime) {
				tOurTime = Date.now();
				tTheirTime = midi.currentTime;
			}
		} else { // paused
			currentTime = midi.currentTime;
		}
		///
		var endTime = midi.endTime;
		var percent = currentTime / endTime;
		var total = currentTime / 1000;
		var minutes = total / 60;
		var seconds = total - (minutes * 60);
		var t1 = minutes * 60 + seconds;
		var t2 = (endTime / 1000);
		///
		if (t2 - t1 < -1.0) {
			return;
		} else {
			callback({
				now: t1,
				end: t2,
				events: noteRegistrar
			});
		}
	};
	///
	midi.animationFrameId = requestAnimationFrame(frame);
};

// helpers

midi.loadMidiFile = function(onsuccess, onprogress, onerror) {
	try {
		midi.replayer = new Replayer(MidiFile(midi.currentData), midi.timeWarp, null, midi.BPM);
		midi.data = midi.replayer.getData();
		buildTimeline();
		///
		MIDI.loadPlugin({
// 			instruments: midi.getFileInstruments(),
			onsuccess: onsuccess,
			onprogress: onprogress,
			onerror: onerror
		});
	} catch(event) {
		onerror && onerror(event);
	}
};

midi.loadFile = function(file, onsuccess, onprogress, onerror) {
	midi.stop();
	if (file.indexOf('base64,') !== -1) {
		var data = window.atob(file.split(',')[1]);
		midi.currentData = data;
		midi.loadMidiFile(onsuccess, onprogress, onerror);
	} else {
		var fetch = new XMLHttpRequest();
		fetch.open('GET', file);
		fetch.overrideMimeType('text/plain; charset=x-user-defined');
		fetch.onreadystatechange = function() {
			if (this.readyState === 4) {
				if (this.status === 200) {
					var t = this.responseText || '';
					var ff = [];
					var mx = t.length;
					var scc = String.fromCharCode;
					for (var z = 0; z < mx; z++) {
						ff[z] = scc(t.charCodeAt(z) & 255);
					}
					///
					var data = ff.join('');
					midi.currentData = data;
					midi.loadMidiFile(onsuccess, onprogress, onerror);
				} else {
					onerror && onerror('Unable to load MIDI file');
				}
			}
		};
		fetch.send();
	}
};

midi.getFileInstruments = function() {
	var instruments = {};
	var programs = {};
	for (var n = 0; n < midi.data.length; n ++) {
		var event = midi.data[n][0].event;
		if (event.type !== 'channel') {
			continue;
		}
		var channel = event.channel;
		switch(event.subtype) {
			case 'controller':
//				console.log(event.channel, MIDI.defineControl[event.controllerType], event.value);
				break;
			case 'programChange':
				programs[channel] = event.programNumber;
				break;
			case 'noteOn':
				var program = programs[channel];
				var gm = MIDI.GM.byId[isFinite(program) ? program : channel];
				instruments[gm.id] = true;
				break;
		}
	}
	var ret = [];
	for (var key in instruments) {
		ret.push(key);
	}
	return ret;
};

// Playing the audio

var timeline = [];
var nextEventIndex = 0;
var trackingQueue = [];
var trackingIndex = 0;
var activeSources = new Set();
var pendingTimers = new Set();
var schedulerId = null;
var startTime = 0;
var startPosition = 0;
var noteRegistrar = {};
var onMidiEvent;
var scheduleAhead = 250; // milliseconds
var schedulerInterval = 25; // milliseconds

var buildTimeline = function() {
	var time = 0.5;
	timeline = [];
	for (var i = 0; i < midi.data.length; i++) {
		time += midi.data[i][1];
		timeline.push({ event: midi.data[i][0].event, time: time });
	}
	midi.endTime = time;
};

var getNow = function() {
	return window.performance && window.performance.now ? window.performance.now() : Date.now();
};

var clockTime = function() {
	return MIDI.api === 'webaudio' ? MIDI.WebAudio.getContext().currentTime : getNow() / 1000;
};

var findEventIndex = function(position) {
	var low = 0;
	var high = timeline.length;
	while (low < high) {
		var middle = (low + high) >> 1;
		if (timeline[middle].time < position) low = middle + 1;
		else high = middle;
	}
	return low;
};

var playhead = function() {
	return Math.min(midi.endTime + Math.max(0, midi.startDelay), startPosition + (clockTime() - startTime) * 1000);
};

var dispatchTracking = function(position) {
	while (trackingIndex < trackingQueue.length && trackingQueue[trackingIndex].time <= position) {
		var item = trackingQueue[trackingIndex++];
		if (typeof item.timer === 'number') pendingTimers.delete(item.timer);
		var data = {
			channel: item.event.channel,
			note: item.event.noteNumber - (midi.MIDIOffset || 0),
			now: item.time,
			end: midi.endTime,
			message: item.event.subtype === 'noteOn' ? 144 : 128,
			velocity: item.event.subtype === 'noteOn' ? item.event.velocity : 0
		};
		if (data.message === 128) delete noteRegistrar[data.note];
		else noteRegistrar[data.note] = data;
		if (onMidiEvent) onMidiEvent(data);
	}
	if (trackingIndex > 0) {
		trackingQueue.splice(0, trackingIndex);
		trackingIndex = 0;
	}
};

var scheduleEvent = function(item, position) {
	var event = item.event;
	if (event.type !== 'channel') return;
	var channelId = event.channel;
	var channel = MIDI.channels[channelId];
	var remaining = Math.max(0, item.time + midi.startDelay - position) / 1000;
	var delay = MIDI.api === 'webaudio' ? clockTime() + remaining :
		MIDI.api === 'webmidi' ? getNow() / 1000 + remaining : remaining;
	var source;
	switch (event.subtype) {
		case 'controller':
			MIDI.setController(channelId, event.controllerType, event.value, delay);
			break;
		case 'programChange':
			MIDI.programChange(channelId, event.programNumber, delay);
			break;
		case 'pitchBend':
			MIDI.pitchBend(channelId, event.value, delay);
			break;
		case 'noteOn':
			if (channel.mute) break;
			source = MIDI.noteOn(channelId, event.noteNumber, event.velocity, delay);
			if (typeof source === 'number') pendingTimers.add(source);
			else if (source) {
				activeSources.add(source);
				source.onended = function() { activeSources.delete(source); };
			}
			trackingQueue.push({ event: event, time: item.time + midi.startDelay, timer: source });
			break;
		case 'noteOff':
			if (channel.mute) break;
			MIDI.noteOff(channelId, event.noteNumber, delay);
			trackingQueue.push({ event: event, time: item.time + midi.startDelay });
			break;
	}
};

var scheduleAudio = function() {
	if (!midi.playing) return;
	var position = playhead();
	var horizon = position + scheduleAhead;
	while (nextEventIndex < timeline.length && timeline[nextEventIndex].time + midi.startDelay <= horizon) {
		scheduleEvent(timeline[nextEventIndex++], position);
	}
	midi.currentTime = Math.min(midi.endTime, position);
	midi.restart = midi.currentTime;
	dispatchTracking(position);
	if (position >= midi.endTime + Math.max(0, midi.startDelay) && nextEventIndex === timeline.length) {
		midi.playing = false;
		window.clearInterval(schedulerId);
		schedulerId = null;
	}
};

var startAudio = function(position, onsuccess) {
	if (!midi.replayer) return;
	if (!midi.data) {
		midi.data = midi.replayer.getData();
		buildTimeline();
	}
	if (midi.playing) stopAudio();
	position = Math.max(0, position || 0);
	if (position >= midi.endTime) position = 0;
	startPosition = position;
	startTime = clockTime();
	midi.currentTime = position;
	midi.playing = true;
	nextEventIndex = findEventIndex(position);
	trackingQueue = [];
	trackingIndex = 0;
	scheduleAudio();
	if (midi.playing) schedulerId = window.setInterval(scheduleAudio, schedulerInterval);
	if (onsuccess) onsuccess();
};

var stopAudio = function() {
	if (midi.playing) midi.currentTime = Math.min(midi.endTime, playhead());
	midi.playing = false;
	midi.restart = midi.currentTime;
	if (schedulerId !== null) window.clearInterval(schedulerId);
	schedulerId = null;
	pendingTimers.forEach(function(timer) { window.clearTimeout(timer); });
	pendingTimers.clear();
	activeSources.forEach(function(source) {
		source.disconnect();
		try { source.stop(clockTime()); } catch (error) { /* Source already stopped. */ }
	});
	activeSources.clear();
	if (MIDI.api === 'webmidi' || MIDI.api === 'audiotag') MIDI.stopAllNotes();
	trackingQueue = [];
	trackingIndex = 0;
	for (var key in noteRegistrar) {
		var note = noteRegistrar[key];
		if (onMidiEvent) {
			onMidiEvent({
				channel: note.channel,
				note: note.note,
				now: note.now,
				end: note.end,
				message: 128,
				velocity: 0
			});
		}
	}
	noteRegistrar = {};
};

})();
