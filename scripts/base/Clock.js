function Clock() {
	this.tickers = []

	this.times = []
	for(var i = 0; i < this.points; i++) this.times.push(this.realdelta)
}

Clock.prototype = {
	id: null,

	realtime: 0,
	realdelta: 16,

	rate: 1,
	time: 0,
	delta: 0,
	count: 0,

	averaging: true,
	points: 12,
	index: 0,

	paused: false,
	running: false,
	managed: false,

	update: function(t) {
		this.count ++
		this.realdelta = t - this.realtime
		this.realtime = t

		this.index = (this.index + 1) % this.points
		this.times[this.index] = this.realdelta

		if(this.managed) {

		} else if(this.paused) {
			this.delta = 0

		} else if(this.averaging) {
			for(var i = 0, s = 0; i < this.points; i++) s += this.times[i]
			this.delta = s / this.points * this.rate

		} else {
			this.delta = this.realdelta * this.rate
		}

		this.time += this.delta


		// reverse order does a FILO stack
		// updating main loop after tweens etc
		for(var i = this.tickers.length -1; i >= 0; i--) {
			var ticker = this.tickers[i]

			if(ticker.autoUpdate) {
				ticker.needsUpdate = true
			}

			if(ticker.ended) {
				ticker.ended = false
				ticker.needsUpdate = true
			}

			if(ticker.needsUpdate) {
				ticker.needsUpdate = false

				if(ticker.realtime) {
					ticker.update(this.realtime, this.realdelta, this.count)

				} else if(ticker.selftime) {
					ticker.count ++
					ticker.delta = this.delta * ticker.rate
					ticker.time += ticker.delta
					ticker.update(ticker.time, ticker.delta, ticker.count)

				} else {
					ticker.update(this.time, this.delta, this.count)
				}

			} else if(ticker.autoRemove) {
				this.tickers.splice(i, 1)
			}
		}
	},

	start: function() {
		if(this.running) return this

		var clock = this
		function loop() {
			clock.id = requestAnimationFrame(loop)
			clock.update(performance.now())
		}

		document.addEventListener('visibilitychange', function() {
			clock.realtime = performance.now()
		})

		this.running = true
		this.realtime = performance.now()
		loop()

		return this
	},

	play: function() {
		return this.start.apply(this, arguments)
	},

	stop: function() {
		if(this.running) {
			this.running = false

			cancelAnimationFrame(this.id)
		}

		return this
	},

	can: function(ticker) {
		return ticker && typeof ticker.update === 'function'
	},

	get: function(func) {
		for(var i = 0; i < this.tickers.length; i++) {
			var ticker = this.tickers[i]

			if(ticker.update === func) return ticker
		}

		return {
			autoUpdate: false,
			needsUpdate: false,
			autoRemove: false,
			update: func
		}
	},

	set: function(ticker, enabled, after) {
		if(typeof ticker === 'function') {
			ticker = this.get(ticker)
		}

		if(!this.can(ticker)) return

		ticker.autoUpdate = enabled
		ticker.autoRemove = enabled
		if(!enabled) return

		if(ticker.selftime) {
			if(!ticker.time) ticker.time = 0
			if(!ticker.rate) ticker.rate = 1
			if(!ticker.delta) ticker.delta = 0
			if(!ticker.count) ticker.count = 0
		}

		if(this.tickers.indexOf(ticker) === -1) {
			if(after) this.tickers.splice(this.tickers.indexOf(after), 0, ticker)
			else this.tickers.push(ticker)
		}
	},

	add: function(ticker, after) {
		this.set(ticker, true, after)
	},

	remove: function(ticker) {
		this.set(ticker, false)
	}
}
