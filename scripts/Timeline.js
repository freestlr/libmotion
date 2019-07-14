function Timeline(clock, controls) {
	this.events = []
	this.active = []
	this.pending = {}

	this.orderS = []
	this.orderE = []

	this.indexS = 0
	this.indexE = -1


	this.clock = clock
	this.time = clock.time
	this.timeDelta = 0
	this.controls = controls

	this.method = Timeline.TWEEN

	this.clock.add(this)
}

Timeline.SET = 1
Timeline.TWEEN = 2
Timeline.ATTRACT = 3

Timeline.prototype = {

	events: null,
	orderS: null,
	orderE: null,

	indexS: null,
	indexE: null,

	time: null,
	timeDelta: null,
	duration: 0,
	easing: null,
	method: null,

	pending: null,
	needsFlush: false,



	add: function(values, duration, delay, easing, color, text, method, loop, mirror) {
		var mtd = method   == null ? this.method   : method
		,   dur = duration == null ? this.duration : duration
		,   del = delay    || 0

		if(typeof easing === 'string') {
			if(easing in TWEEN.EasingEnum) {
				easing = TWEEN.EasingEnum[easing]
			} else {
				console.warn('[TL] unknown easing:', easing)
			}
		}
		if(typeof easing !== 'function') {
			easing = null
		}

		var track = {
			index: this.events.length,
			method: mtd,

			position: 0,
			duration: dur,
			start: this.time + del,
			end: loop ? Infinity : this.time + del + dur,
			loop: loop,
			mirror: mirror,

			delta: {},
			source: {},
			target: values,
			current: {},
			curdelta: {},
			easing: easing,

			color: color,
			text: text
		}

		this.insert(track)

		return track
	},

	addTrack: function(data) {
		return data && this.add(data.values, data.duration, data.delay, data.easing, data.color, data.text, data.method)
	},

	addList: function(list, delay, color, text) {
		var time = 0
		var globalDelay = delay || 0
		var batch = []
		if(list) for(var i = 0; i < list.length; i++) {
			var item = list[i]
			if(!item) continue

			var method = item.method == null ? this.method : item.method
			var dur = item.duration == null ? (method === Timeline.SET ? 0 : this.duration) : item.duration
			var del = (item.delay || 0) + globalDelay

			batch.push(this.add(item.values, dur, del,
				item.easing || this.easing,
				color, text ? text +'/'+ i : null, method,
				item.loop, item.mirror))

			time = Math.max(time, del + dur)
		}

		return batch
	},

	addSeries: function(series, delay, color, text) {
		var time = delay || 0
		var dur = this.duration
		var del = 0
		var method = this.method
		var easing = this.easing
		var batch = []

		if(series) for(var i = 0; i < series.length; i++) {
			var item = series[i]
			if(!item) continue

			if(item.duration != null) dur = item.duration
			if(item.method   != null) method = item.method
			if(item.easing   != null) easing = item.easing
			if(item.color    != null) color = item.color
			del = item.delay || 0

			if(item.method === Timeline.SET) dur = 0

			batch.push(this.add(item.values, dur, del + time,
				easing,
				color, text ? text +'/'+ i : null, method,
				item.loop, item.mirror))

			time += del + dur
		}

		return batch
	},

	stop: function(track) {
		var ei = this.events.indexOf(track)
		if(ei === -1) return

		var forward = this.timeDelta >= 0

		if(track.end < this.time) {
			if(!forward) this.drop(track)

		} else if(track.start > this.time) {
			if(forward) this.drop(track)

		} else {
			this.activate(track, false, forward)
		}
	},

	stopList: function(list) {
		if(!list) return

		for(var i = 0; i < list.length; i++) {
			this.stop(list[i])
		}
	},

	insert: function(track) {

		var l = this.events.length
		for(var fi = l - 1; fi >= 0; fi--) {
			var ev = this.events[this.orderS[fi]]
			if(ev.start === track.start && ev.index < track.index && ev.duration <= track.duration) break
			if(ev.start < track.start) break
		}

		for(var bi = l - 1; bi >= 0; bi--) {
			var ev = this.events[this.orderE[bi]]
			if(ev.end === track.end && ev.index < track.index && ev.duration <= track.duration) break
			if(ev.end < track.end) break
		}

		this.orderS.splice(fi + 1, 0, track.index)
		this.orderE.splice(bi + 1, 0, track.index)

		if(fi + 1 < this.indexS) this.indexS++
		if(bi + 1 < this.indexE) this.indexE++



		this.events.push(track)

		if(track.start < this.time) {
			this.activate(track, true, this.timeDelta >= 0)
			this.indexS++
			this.indexE++
		}
	},

	drop: function(track) {
		var fi = this.orderS.indexOf(track.index)
		var bi = this.orderE.indexOf(track.index)
		var ei = this.events.indexOf(track)
		if(fi === -1 || bi === -1 || ei === -1) return

		this.orderS.splice(fi, 1)
		this.orderE.splice(bi, 1)
		this.events.splice(ei, 1)

		for(var i = ei; i < this.events.length; i++) {
			this.events[i].index--
		}
		for(var i = 0; i < this.events.length; i++) {
			if(this.orderS[i] >= ei) this.orderS[i]--
			if(this.orderE[i] >= ei) this.orderE[i]--
		}

		if(this.indexS > fi) this.indexS--
		if(this.indexE > bi) this.indexE--

		var ai = this.active.indexOf(track)
		if(ai !== -1) this.active.splice(ai, 1)
	},

	dropList: function(list) {
		if(!list) return

		for(var i = 0; i < list.length; i++) {
			this.drop(list[i])
		}
	},

	getDuration: function(list) {
		var duration = 0
		if(list) for(var i = 0; i < list.length; i++) {
			var item = list[i]
			if(item) duration = Math.max(duration, (item.delay || 0) + (item.duration || 0))
		}
		return duration
	},

	getCompletion: function(list) {
		var duration = 0
		if(list) for(var i = 0; i < list.length; i++) {
			var item = list[i]
			if(item) duration = Math.max(duration, item.end - this.time)
		}
		return duration
	},

	getStarting: function(list) {
		var delay = 0
		if(list) for(var i = 0; i < list.length; i++) {
			var item = list[i]
			if(item) delay = Math.min(delay, item.start - this.time)
		}
		return delay
	},

	getClipDuration: function(clip) {
		var duration = 0
		if(clip) for(var i = 0; i < clip.length; i++) {
			var track = clip[i]
			if(track) duration = Math.max(duration, track.end - this.time)
		}
		return duration
	},

	clear: function(time) {
		this.active = []
		this.events = []

		this.orderS = []
		this.orderE = []

		this.indexS = 0
		this.indexE = -1
	},

	revert: function(batch, time) {
		for(var i = 0; i < this.active.length; i++) {
			var item = this.active[i]

			if(!batch || batch.indexOf(item.index) !== -1) {

			}
		}
	},

	activate: function(track, enabled, forward) {
		var iv = this.controls.inputVal

		if(!enabled) {
			if(forward) {
				track.end = this.time
			} else {
				track.start = this.time
			}
			track.duration = track.end - track.start
		}

		var overwrite = enabled ^ forward ? track.target : track.source
		for(var key in track.target) {
			overwrite[key] = key in this.pending ? this.pending[key] : iv[key]

			var src = track.source[key]
			,   dst = track.target[key]
			track.delta[key] = typeof src === 'number' && typeof dst === 'number' ? dst - src : NaN
		}

		track.position = enabled ^ forward ? 1 : 0
		track.active = enabled

		var ai = this.events.indexOf(track)
		var si = this.orderS.indexOf(ai)
		var ei = this.orderS.indexOf(ai)
		console.log('-+'[+enabled], this.clock.frame, f.hround(performance.now()), '#'+ ai, '>'+ si, ei +'<')

		if(enabled) {
			if(this.updateTrack(track, this.time, this.timeDelta)) {
				forward ? this.active.unshift(track) : this.active.push(track)
			}
		} else {
			this.active.splice(this.active.indexOf(track), 1)
		}
	},

	updateTrack: function(track, t, dt) {
		var ts = track.start
		,   td = Math.max(1e-10, track.duration)
		,   te = Math.max(ts + td, track.end)
		,   tc = Math.max(ts, Math.min(te, t))

		var c = (tc - ts) / td
		,   p = track.loop ? track.mirror && Math.floor(c) % 2 ? 1 - (c % 1) : c % 1 : Math.max(0, Math.min(1, c))
		,   k = track.easing ? track.easing(p) : p
		,   d = k - track.position

		if(d) switch(track.method) {
			case Timeline.ATTRACT:
				this.controls.attractInputs(track.delta, d)
			break

			default:
			case Timeline.SET:
			case Timeline.TWEEN:
				for(var key in track.delta) {
					var val = track.delta[key]

					if(val === val) {
						this.enqueue(key, val, d)

					} else {
						this.enqueue(key, dt > 0 ? track.target[key] : track.source[key], 0)
					}
				}
			break
		}

		track.position = k
		track.active = tc === t

		// if(track.update) {
		// 	track.update(t, dt)
		// }

		return track.active
	},

	getDelta: function(from, to) {

	},

	enqueue: function(key, val, rel) {
		var cur = key in this.pending ? this.pending[key] : this.controls.inputVal[key]
		this.pending[key] = rel ? cur + val * rel : val
		this.needsFlush = true
	},

	update: function(t, dt) {
		var pt = this.time
		var ct = pt

		this.time = t
		this.timeDelta = dt


		var l = this.events.length

		var orderF = dt >= 0 ? this.orderS : this.orderE
		var orderB = dt >= 0 ? this.orderE : this.orderS
		var prevF = dt >= 0 ? this.indexS : this.indexE
		var prevB = dt >= 0 ? this.indexE : this.indexS



		for(this.indexS = 0; this.indexS < l; this.indexS++) {
			if(this.events[this.orderS[this.indexS]].start > t) break
		}
		for(this.indexE = l - 1; this.indexE >= 0; this.indexE--) {
			if(this.events[this.orderE[this.indexE]].end < t) break
		}

		var nextF = dt >= 0 ? this.indexS : this.indexE
		var nextB = dt >= 0 ? this.indexE : this.indexS

		// do {

		// } while()


		if(dt) for(var i = this.active.length -1; i >= 0; i--) {
			if(!this.updateTrack(this.active[i], t, dt)) {
				this.active.splice(i, 1)
			}
		}



		var a, ai
		for(var i = this.indexE; i > ai; i--) {
			this.activate(this.events[a[i]], true, false)
		}
		for(var i = this.indexS; i < ai; i++) {
			this.activate(this.events[a[i]], true, true)
		}

		if(this.needsFlush) {
			this.needsFlush = false
			this.controls.setInputs(this.pending, 0)
			this.pending = {}
		}
	}
}
