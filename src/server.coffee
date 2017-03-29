bodyParser           = require 'body-parser'
express              = require 'express'
fs                   = require 'fs'
path                 = require 'path'
webpack              = require 'webpack'
webpackHotMiddleware = require 'webpack-hot-middleware'
webpackMiddleware    = require 'webpack-dev-middleware'
yaml                 = require 'yamljs'

# config               = require '../../webpack.dev.config.js'
config           = require path.resolve('webpack.dev.config.js')
# productionConfig     = require '../../webpack.package.config.js'
productionConfig = require path.resolve('webpack.package.config.js')

app  = express()
port = 3000

compiler   = webpack config
middleware = webpackMiddleware compiler,
	publicPath: config.output.publicPath,
	contentBase: 'build',
	stats:
		colors: true,
		hash: false,
		timings: true,
		chunks: false,
		chunkModules: false,
		modules: false

app.use (req, res, next) ->
	res.header 'Access-Control-Allow-Origin', '*'
	res.header 'Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept'
	next()

app.use bodyParser.json()
app.use bodyParser.urlencoded
	extended: true
app.use middleware
app.use webpackHotMiddleware(compiler)

qsets = path.join __dirname, '..', 'qsets'

app.get '/', (req, res) ->
	file = getFile 'index.html'
	res.write templateSwap(file, 'title', getWidgetTitle())
	res.end()

app.get '/download', (req, res) ->
	productionCompiler = webpack productionConfig
	productionMiddleware = webpackMiddleware productionCompiler,
		publicPath: productionConfig.output.publicPath,
		contentBase: '.build'

	productionMiddleware.waitUntilValid ->
		widget = makeWidget()

		res.set 'Content-Disposition', 'attachment; filename=' + widget.clean_name + '.wigt'
		res.send productionMiddleware.fileSystem.readFileSync path.join(productionConfig.output.path, '_output', widget.clean_name + '.wigt')

app.get '/player/:instance?', (req, res) ->
	instance = req.params.instance or 'demo'

	file = getFile 'player_container.html'

	res.write templateSwap(file, 'instance', instance)
	res.end()

app.get '/creator/:instance?', (req, res) ->
	instance = req.params.instance or null

	file = getFile 'creator_container.html'

	res.write templateSwap(file, 'instance', instance)
	res.end()

app.post '/widget_instances_get', (req, res) ->
	id = JSON.parse(req.body.data)[0][0]
	instance = makeWidgetInstance id

	res.send JSON.stringify(instance)

app.post '/widget_instance_save', (req, res) ->
	data = JSON.parse(req.body.data)

	id = data[0] || new Date().getTime()
	fs.writeFileSync path.join(qsets, id + '.json'), JSON.stringify(data[2])

	instance = makeWidgetInstance(data[0])[0]
	instance.id = id
	instance.name = data[1]
	fs.writeFileSync path.join(qsets, id + '.instance.json'), JSON.stringify([instance])
	res.end JSON.stringify(instance)

app.post '/widgets_get', (req, res) ->
	id = JSON.parse(req.body.data)[0][0]
	widget = makeWidget id

	res.send JSON.stringify([widget])

app.post '/question_set_get', (req, res) ->
	id = JSON.parse(req.body.data)[0]

	# load instance, fallback to demo
	try
		res.send fs.readFileSync(path.join(qsets, id+'.json')).toString()
	catch e
		res.send getWidgetDemo()

app.get '/questions/import/', (req, res) ->
	res.write getFile 'question_importer.html'
	res.end()

app.post '/questions_get/', (req, res) ->
	given = JSON.parse(req.body.data)

	# we selected specific questions
	if given[0]
		res.end JSON.stringify(getQuestion given[0])
	# we just want all of them from the given type
	else
		res.end JSON.stringify(getAllQuestions given[1])

app.post '/session_valid', (req, res) ->
	res.end()

app.post '/play_logs_save', (req, res) ->
	logs = JSON.parse(req.body.data)[1]
	console.log(logs)

	res.end("{ \"score\": 0 }")

app.get '/assets/*', (req, res) ->
	res.write getFile('assets/'+req.params[0])
	res.end()

app.get '/build/*', (req, res) ->
	res.write getFile(req.params[0])
	res.end()

# DO NOT KEEP THIS
# SEE WHAT FILES WE CAN GRAB FROM HERE
app.get '/showfiles', (req, res) ->
	middleware.fileSystem.readdir config.output.publicPath, (err, files) ->
		console.log files
	res.end()

app.listen port, 'localhost', (err) ->
	if err
		console.log err
	console.info('==> Listening on port %s. Open up http://localhost:%s/ in your browser.', port, port);

getFile = (file) ->
	try
		middleware.fileSystem.readFileSync path.join(config.output.publicPath, file)
	catch e
		console.log 'error trying to load '+file

templateSwap = (file, target, replace) ->
	str = file.toString()
	re = new RegExp '{{' + target + '}}', 'g'
	if replace is null
		re = new RegExp '(\'|"){{' + target + '}}(\'|")', 'g'

	Buffer.from str.replace(re, replace)

# WIDGET METHODS
getWidgetTitle = ->
	install = getFile 'install.yaml'
	yaml.parse(install.toString()).general.name

makeWidgetInstance = (id) ->
	qset = null
	widget = null
	widgetPath = null

	# attempt to load a previously saved instance
	try
		return JSON.parse fs.readFileSync(path.join(qsets, id+'.instance.json')).toString()
	catch e

	# generate a new one
	try
		qset = JSON.parse getFile('demo.json').toString()
		widget = makeWidget id
	catch e
		console.log 'Error in makeInstance from the widget.coffee file:'
		console.log e

	[{
		'attempts': '-1',
		'clean_name': '',
		'close_at': '-1',
		'created_at': '1406649418',
		'embed_url': '',
		'height': 0,
		'id': '',
		'is_draft': true,
		'name': qset.name,
		'open_at': '-1',
		'play_url': '',
		'preview_url': '',
		'qset': {
		  'version': null,
		  'data': null
		},
		'user_id': '1',
		'widget': widget,
		'width': 0
	}]

makeWidget = (id) ->
	widget = yaml.parse getFile('install.yaml').toString()

	widget.player = widget.files.player
	widget.creator = widget.files.creator
	widget.clean_name = widget.general.name.replace(new RegExp(' ', 'g'), '-').toLowerCase()
	widget.dir = widget.clean_name + '/'
	widget.width = widget.general.width
	widget.height = widget.general.height
	widget

getWidgetDemo = ->
	JSON.stringify JSON.parse(getFile('demo.json').toString()).qset

getQuestion = (ids) ->
	# convert the given ids to numbers
	ids = ids.map (id) ->
		+id

	qlist = []

	obj = JSON.parse fs.readFileSync(path.join(__dirname, 'devmateria_questions.json')).toString()
	i = 1

	qarr = obj.set
	for q in qarr
		q.id = i++
		continue unless +q.id in ids
		qlist.push
			id: q.id
			type: q.type
			created_at: Date.now()
			questions: q.questions
			answers: q.answers
			options: q.options
			assets: q.assets

	return qlist

getAllQuestions = (type) ->
	type = type.replace('Multiple%20Choice', 'MC')
	type = type.replace('Question%2FAnswer', 'QA')
	types = type.split(',')

	qlist = []

	obj = JSON.parse fs.readFileSync(path.join(__dirname, 'devmateria_questions.json')).toString()
	i = 1

	qarr = obj.set
	for q in qarr
		q.id = i++
		continue unless q.type in types
		qlist.push
			id: q.id
			type: q.type
			text: q.questions[0].text
			uses: Math.round(Math.random() * 1000)
			created_at: Date.now()

	return qlist