function Controls(inputs, scope, gui) {
	this.scope = scope || this

	this.inputMap = {}
	this.inputVal = {}
	this.inputAtt = {}
	this.inputFol = {}
	this.inputPlt = {}
	this.inputFch = {}

	this.presets = {}
	this.presets.defaults = {}

	this.root = {}


	this.inputsTween = new TWEEN.Tween({ }).to({ })
		.easing(TWEEN.Easing.Cubic.InOut)

	this.datinit(gui)
	this.addInputs(this.inputs, this)
	this.addInputs(inputs, scope)
}

Controls.prototype = {

	gui: null,
	presets: null,
	inputMap: null,

	inputs: {
		controls: {
			folder: true,
			hide: false,
			forget: true,

			autoUpdate  : { val: true },
			attractTime : { val: 1000, min: 0, max: 3000 },
			tweenTime   : { val: 1000, min: 0, max: 3000 },
		}
	},

	display: function(visible) {
		this.visible = visible
		if(this.gui) this.visible ? this.gui.open() : this.gui.close()
	},

	datinit: function(options) {
		if(!options || typeof dat === 'undefined') return

		var merged = {
			autoPlace: true,
			width: 240,
			closed: true,
			hideable: true
		}
		for(var key in options) {
			merged[key] = options[key]
		}

		var closed = !!merged.closed
		delete merged.closed

		this.gui = new dat.GUI(merged)
		this.gui.closed = closed

		this.root.con = this.gui
	},

	reserved: ['con', 'parent', 'scope'],

	add: function(key, def, root, scope) {
		if(!key || !def || typeof def !== 'object' || this.reserved.indexOf(key) !== -1) {
			return
		}
		if(!root) {
			root = this.root
		}

		def.key = key
		def.parent = root
		def.scope = def.scope || scope || root.scope
		if(root && root[key] !== def) {
			root[key] = def
		}


		if(def.folder) {

			if(key in this.inputFol) {
				console.error('folders conflict:', key)
			}
			this.inputFol[key] = def

			if(root.con) {
				def.con = root.con.addFolder(def.name || key)
				if(def.open) def.con.open()
				if(def.hide) dom.display(def.con.domElement, false)
			}

			for(var key in def) this.add(key, def[key], def)

		} else {
			var con = null
			if(def.options) {

			} else if(def.color) {

				if(typeof THREE !== 'undefined') {
					def.color = new THREE.Color(def.val)
					def.colorTween = new TWEEN.Tween(def.color)
						.to(new THREE.Color(def.color))
						.copy(this.inputsTween)

					if(root.con) {
						def.uiv = '#'+ def.color.getHexString()
						con = root.con.addColor(def, 'uiv')
					}
				}


			} else if('val' in def) {

				if(typeof def.attract === 'undefined') {
					def.attract = true
				}

				if(root.con) {
					def.uiv = def.val
					con = root.con.add(def, 'uiv')

					if(con && 'min'  in def && con.min ) con = con.min(def.min)
					if(con && 'max'  in def && con.max ) con = con.max(def.max)
					if(con && 'step' in def && con.step) con = con.step(def.step)
				}
			}

			if(con && def.hide) {
				dom.display(con.__li, false)
			}


			def.con = con

			if(con) {
				con.onChange(f.bindr(this.onInputChange, this, [def]))
				con.name(def.name || key)

			} else {
				// console.warn('Unknown control:', key, def)
			}

			if(def.fetch) {
				this.inputFch[key] = def
			}

			if(def.plot) {
				this.addPlot(def)
			}

			if(key in this.inputMap) {
				console.error('inputs conflict:', key)
			}
			if(!def.forget && !def.parent.forget) {
				this.presets.defaults[key] = def.val
			}
			this.inputMap[key] = def
			this.inputVal[key] = def.val
		}
	},

	addPlot: function(def) {
		var plot = def.plot = f.copy({
			size: 32,
			width: 241,
			height: 42,
			color: '#bada55',
			back: '#333',
		}, def.plot)

		plot.values = new Float32Array(plot.size)
		plot.index = -1
		plot.min =  Infinity
		plot.max = -Infinity

		if(def.con) {
			plot.canvas = dom.elem('canvas', 'gui-plot', def.con.__li)
			plot.context = plot.canvas.getContext('2d')
			def.con.__li.style.height = 'auto'
		}

		this.inputPlt[def.key] = def.plot

		this.resizePlot(def, plot)
	},

	addInputs: function(inputs, scope, root) {
		for(var key in inputs) {
			this.add(key, inputs[key], root, scope)
		}
	},

	remove: function(key) {
		var def = this.inputMap[key]
		if(!def) return

		if(def.con) {
			def.parent.con.remove(def.con)
		}

		delete def.parent[def.key]

		delete this.inputMap[key]
		delete this.inputVal[key]
		delete this.inputAtt[key]
	},

	removeFolder: function(fol) {
		var def = this.inputFol[fol]
		if(!def) return

		for(var key in def) {
			var val = def[key]
			if(!val || typeof val !== 'object' || key === 'parent' || key === 'con') continue

			if(val.folder) {
				this.removeFolder(key)
			} else {
				this.remove(key)
			}
		}

		if(def.con) {
			// def.parent.con.remove(def.con)

			// wtf that gui cant remove folders itself
			def.con.close()
			def.parent.con.__ul.removeChild(def.con.domElement.parentNode)
			delete def.parent.con.__folders[def.key]
			def.parent.con.onResize()
		}

		delete this.inputFol[def.key]
	},

	onInputChange: function(def, next) {
		if(!def) return

		var last = def.val
		if(next === last) return

		if(def.step === 1) next = Math.round(next)
		if(Math.abs(next - last) < 1e-6) return



		if(def.attract) {
			this.attract(def.key, next, 0)
		} else {
			this.set(def.key, next, 0)
		}
	},

	attract: function(key, val, rel) {
		var def = this.inputMap[key]
		if(!def) return

		var att = this.inputAtt[def.key] || 0

		var diff = rel ? val * rel + att : val - def.val
		var dist = def.circle ? f.radistp(diff, def.max - def.min || 2 * Math.PI) : diff
		if(dist) this.inputAtt[def.key] = dist
		else delete this.inputAtt[def.key]
	},

	attractInputs: function(data, rel) {
		for(var key in data) {
			this.attract(key, data[key], rel)
		}
	},

	set: function(key, val, rel) {
		var def = this.inputMap[key]
		if(!def) return

		var prev = def.val


		if(def.color) {
			if(!rel) def.color.set(val)
			def.val = def.color.getHex()

		} else if(typeof def.val === 'boolean') {
			if(!rel) def.val = !!val
			else if(val) def.val = val > 0

		} else {
			def.val = rel ? def.val + val * rel : val
			if(def.step === 1) def.val = Math.round(def.val)
		}

		if(def.strict) {
			if(def.val > def.max) def.val = def.max
			if(def.val < def.min) def.val = def.min
		}

		if(prev === def.val) return


		// console.log('con', key, f.cround(def.val - prev), '+', f.cround(prev), '->', f.cround(def.val))
		this.inputVal[key] = def.val

		var scope = def.scope || def.parent.scope || this.scope
		if(!scope) return

		var flag = def.flag || def.parent.flag
		if(flag) scope[flag] = true

		var prop = def.prop
		if(prop && prop in scope) scope[prop] = def.val

		if(!def.silent) {
			var change = def.change || def.parent.change
			if(change) {
				if(typeof change === 'string') change = scope[change]
				if(typeof change === 'function') change.call(scope, def.val, prev)
			}
		}
	},

	setInputs: function(data, rel) {
		for(var key in data) this.set(key, data[key], rel)
	},

	tweenInputs: function(data, time) {
		this.inputsTween.target = {}

		for(var key in data) {
			var val = data[key]
			,   def = this.inputMap[key]

			if(!def || def.val === val) {
				// delete data[key]
				continue
			}

			// console.log('tween', key, def.val, '->', val)

			if(def.colorTween) {
				def.colorTween.target.set(val)
				this.inputsTween.target[key] = def.colorTween

			} else {
				// this.inputAtt[key] = val
				this.inputsTween.source[key] = def.val
				this.inputsTween.target[key] = val
			}
		}

		this.inputsTween
			.duration(time || this.inputMap.tweenTime.val)
			.start()
	},

	resizePlot: function(def, plot) {
		var w = plot.width
		,   h = plot.height
		,   fg = plot.color
		,   bg = plot.back
		,   name = def.name || def.key
		,   cvs = plot.canvas
		,   ctx = plot.context

		var PR = Math.round( window.devicePixelRatio || 1 );

		var WIDTH = w * PR,
			HEIGHT = h * PR,
			TEXT_X = 3 * PR,
			TEXT_Y = 2 * PR,
			TEXT_HEIGHT = 9 * PR,
			GRAPH_X = 3 * PR,
			GRAPH_Y = TEXT_Y + TEXT_HEIGHT + GRAPH_X,
			GRAPH_WIDTH = WIDTH - 2 * GRAPH_X,
			GRAPH_HEIGHT = HEIGHT - GRAPH_Y - GRAPH_X;

		cvs.width = WIDTH;
		cvs.height = HEIGHT;
		cvs.style.width = w +'px';
		cvs.style.height = h +'px';
	},

	updatePlot: function(def) {
		var plot = def && def.plot
		if(!plot) return

		var size = def.con.domElement.parentNode.offsetWidth
		if(plot.width !== size) {
			plot.width = size

			this.resizePlot(def, plot)
		}

		var cvs = plot.canvas
		,   ctx = plot.context

		var PR = Math.round( window.devicePixelRatio || 1 )
		var WIDTH = plot.width * PR
		var HEIGHT = plot.height * PR

		ctx.fillStyle = plot.color;
		ctx.globalAlpha = 1;
		ctx.drawImage(cvs, 0 + PR, 0, WIDTH - PR, HEIGHT, 0, 0, WIDTH - PR, HEIGHT)

		ctx.fillStyle = plot.color;
		ctx.globalAlpha = 1;
		ctx.fillRect(WIDTH - PR, 0, PR, HEIGHT)

		ctx.fillStyle = '#000';
		ctx.globalAlpha = 0.9;
		ctx.fillRect(WIDTH - PR, 0, PR, Math.round((1 - (def.val / def.max)) * HEIGHT))
	},

	update: function() {
		var iv = this.inputVal

		var attractDelta = {}
		,   attractForce = 1 - Math.pow(Math.E, Math.log(1e-30) / iv.attractTime)
		,   attractInputs = false
		,   attractEps = 1e-7
		for(var key in this.inputAtt) {
			var def = this.inputMap[key]
			,   diff = this.inputAtt[key]

			var add = diff * attractForce
			,   abs = Math.abs(add)
			if(def.step === 1) {
				add = Math.ceil(abs) * add / abs
			}

			var mid = Math.abs(def.min + def.max) / 2 || Math.abs(def.val) + Math.abs(diff)
			if(!mid || abs / mid < attractEps || Math.abs(diff) < attractEps) {
				add = diff
				delete this.inputAtt[key]

			} else {
				this.inputAtt[key] = diff - add
			}

			attractDelta[key] = add
			attractInputs = true
		}
		if(attractInputs) {
			this.setInputs(attractDelta, 1)
		}


		if(this.inputsTween.playing || this.inputsTween.ended) {
			this.setInputs(this.inputsTween.delta, 1)
		}

		for(var key in this.inputFch) {
			var def = this.inputFch[key]

			def.val = def.scope[def.prop]
		}

		for(var key in this.inputPlt) {
			var plot = this.inputPlt[key]
			var val = this.inputVal[key]

			// plot.values[plot.index] = val
			// plot.index = (plot.index +1) % plot.size

			plot.index ++
			plot.index %= plot.size
			plot.values[plot.index] = val
			if(plot.min > def.val) plot.min = def.val
			if(plot.max < def.val) plot.max = def.val
		}

		if(iv.autoUpdate && this.gui) for(var key in this.inputMap) {
			var def = this.inputMap[key]
			if('uiv' in def) {
				var uiv = def.color ? '#'+ def.color.getHexString() : def.val
				if(uiv === def.uiv) continue
				def.uiv = uiv
			}
			if(def.con) def.con.updateDisplay()
			if(def.plot) this.updatePlot(def)
		}
	}
}
