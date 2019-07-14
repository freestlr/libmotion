function Timeline(clock, controls) {
	this.events = []
	this.points = []
	this.active = []
	this.pending = {}



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
	points: null,

	time: null,
	timeDelta: null,
	duration: 300,
	easing: null,
	method: null,

	pending: null,
	needsFlush: false,

	verbose: false,



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

		this.events.push(track)

		this.updateTimePoints()

		if(track.start < this.time) {
			console.warn('[TL] added track with start in past')
			this.activate(track, true, this.timeDelta >= 0, this.time)
		}

		if(track.end < this.time) {
			console.warn('[TL] added track with end in past')
		}

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
			this.activate(track, false, forward, this.time)
		}
	},

	stopList: function(list) {
		if(!list) return

		for(var i = 0; i < list.length; i++) {
			this.stop(list[i])
		}
	},

	/**
	 * Sorting:
	 * 1) same track start before end
	 * 2) lower time first
	 * 3) end before start
	 * 4) shorter duration first ?
	 * 5) order of appearance
	 */
	sortTimePoints: function(a, b) {
		if(a.track === b.track) return a.end - b.end

		var dt = a.time - b.time
		if(dt) return dt

		var de = a.end - b.end
		if(de) return -de

		var dd = a.track.duration - b.track.duration
		if(dd) return dd

		var di = a.track.index - b.track.index
		return di
	},

	updateTimePoints: function() {
		this.points = []

		for(var i = 0; i < this.events.length; i++) {
			var e = this.events[i]

			this.points.push({
				time: e.start,
				end: 0,
				track: e
			}, {
				time: e.end,
				end: 1,
				track: e
			})
		}

		this.points.sort(this.sortTimePoints)
	},

	drop: function(track) {
		var index = this.events.indexOf(track)
		if(index === -1) return

		this.events.splice(index, 1)

		for(var i = index; i < this.events.length; i++) {
			this.events[i].index--
		}


		var ai = this.active.indexOf(track)
		if(ai !== -1) this.active.splice(ai, 1)

		this.updateTimePoints()
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
		this.points = []
	},

	revert: function(batch, time) {
		for(var i = 0; i < this.active.length; i++) {
			var item = this.active[i]

			if(!batch || batch.indexOf(item.index) !== -1) {

			}
		}
	},

	activate: function(track, enabled, forward, time) {
		var index = this.active.indexOf(track)
		if((index === -1) ^ enabled) return


		if(enabled) {
			this.active.push(track)
		} else {
			this.active.splice(index, 1)
		}



		var end = enabled ^ forward

		track.position = end ? 1 : 0
		track.active = enabled


		if(!enabled) {
			var point = forward ? track.end : track.start
			if(point === time) return

			if(forward) {
				track.end = time
			} else {
				track.start = time
			}
			track.duration = track.end - track.start

			this.updateTimePoints()
		}


		var iv = this.controls.inputVal

		var overwrite = end ? track.target : track.source
		for(var key in track.target) {
			overwrite[key] = key in this.pending ? this.pending[key] : iv[key]

			var src = track.source[key]
			,   dst = track.target[key]
			track.delta[key] = typeof src === 'number' && typeof dst === 'number' ? dst - src : NaN
		}
	},

	updateTrack: function(track, t, forward) {
		var ts = track.start
		,   td = track.duration
		,   te = Math.max(ts + td, track.end)
		,   tc = Math.max(ts, Math.min(te, t))

		var c = td ? (tc - ts) / td : forward ? 1 : 0
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
						this.enqueue(key, forward ? track.target[key] : track.source[key], 0)
					}
				}
			break
		}

		track.position = k
		track.active = tc === t
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


		this.time = t
		// this.timeDelta = dt
		this.timeDelta = t - pt

		var fw = this.timeDelta >= 0





		var currT = pt
		var nextT = t
		var currI = fw ? 0 : -1
		var nextI = fw ? 0 : -1
		for(var i = -1; i < this.points.length; i++) {
			var p = this.points[i + (fw ? 0 : 1)]
			if(!p) continue

			if(currT > p.time) currI++
			if(nextT > p.time) nextI++
			if(currT <= p.time && nextT <= p.time) break
		}


		var verbose = this.verbose && currI !== nextI
		if(verbose) console.log('frame', this.clock.frame, f.hround(this.clock.time))

		while(currI !== nextI) {
			var p = this.points[currI]
			currI += fw ? 1 : -1

			if(!p) continue


			for(var i = 0; i < this.active.length; i++) {
				this.updateTrack(this.active[i], p.time, fw)
			}

			if(verbose) console.log('=', this.active.length, 'by', p.time - currT, this.pending)


			if(verbose) {
				console.log('-+'[+(fw ^ p.end)], p.track.index)
			}

			this.activate(p.track, fw ^ p.end, fw, p.time)

			currT = p.time
		}

		for(var i = 0; i < this.active.length; i++) {
			this.updateTrack(this.active[i], t, fw)
		}

		if(verbose) console.log('=', this.active.length, 'by', t - currT, this.pending)



		if(this.needsFlush) {
			this.needsFlush = false
			this.controls.setInputs(this.pending, 0)
			this.pending = {}
		}

		if(verbose) console.log('\n')
	}
}
