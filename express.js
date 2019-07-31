const path            = require('path');
const fs              = require('fs')
const express         = require('express')
const qsets           = path.join(__dirname, 'qsets');
const yaml            = require('yamljs');
const { execSync }    = require('child_process');
const waitUntil       = require('wait-until-promise').default
const hoganExpress    = require('hogan-express')
const uuid            = require('uuid')

var webPackMiddleware = false;
var hasCompiled = false;

// this will call next() once webpack is ready by trying to:
// 1. talk to the middlware
// 2. load the widget's install.yaml from webpack's in-memory files
var waitForWebpack = (app, next) => {
	if(process.env.TEST_MWDK) return next(); // short circuit for tests
	if(hasCompiled) return next(); // short circuit if ready

	waitUntil(() => {
		// check for the middleware first
		if(!webPackMiddleware){
			// search express for the webpack middleware
			var found = app._router.stack.filter(mw => mw && mw.handle && mw.handle.name === 'webpackDevMiddleware')
			if(found.length == 0) return false // not ready
			webPackMiddleware = found[0].handle // found!
		}

		// then check to see if we can find install.yaml
		try {
			getInstall()
			return true
		} catch(e) {
			console.log("waiting for 'install.yaml' to be served by webpack")
			return false
		}
	}, 10000, 250)
	.then(() => {
		hasCompiled = true // so we don't check again
		return next();
	})
	.catch((error) => {
		throw "MWDK couldn't locate the widget's install.yaml.  Make sure you have one and webpack is processing it."
	})
}
// For whatever reason, the middleware isn't availible when this class
var getWebPackMiddleWare = (app) => {
	if(webPackMiddleware) return webPackMiddleware

	var t = app._router.stack.filter((layer) => {
		return layer && layer.handle && layer.handle.name === 'webpackDevMiddleware';
	})

	if(t.length > 0){
		webPackMiddleware = t[0].handle
		return webPackMiddleware
	}
}

// Loads processed widget files from webpack's memory
var getFileFromWebpack = (file, quiet = false) => {
	try {
		// pull the specified filename out of memory
		return webPackMiddleware.fileSystem.readFileSync(path.resolve('build', file));
	} catch (e) {
		if(!quiet) console.error(e)
		throw `error trying to load ${file} from widget src, reload if you just started the server`
	}
}

// Widget creation/management support functions
var getWidgetTitle = () => {
	const install = getInstall()
	return yaml.parse(install.toString()).general.name;
};

var getDemoQset = () => {
	// generate a new instance with the given ID
	let qset
	try {
		if(process.env.TEST_MWDK){
			qset = fs.readFileSync(path.resolve('views', 'sample-demo.json'))
		}
		else{
			qset = getFileFromWebpack('demo.json')
		}
	} catch (e) {
		console.log(e);
		throw "Couldn't find demo.json file for qset data"
	}

	return performQSetSubsitutions(qset.toString())
}

var performQSetSubsitutions = (qset) => {
	console.log('media and ids inserted into qset..')
	// convert media urls into usable ones
	qset = qset.replace(/"<%MEDIA='(.+?)'%>"/g, '"__$1__"')

	// look for "id": null or "id": 0 or "id": "" and build a mock id
	qset = qset.replace(/("id"\s?:\s?)(null|0|"")/g, () => `"id": "mwdk-mock-id-${uuid()}"`)

	return JSON.parse(qset)
}

// create a widget instance data structure
var createApiWidgetInstanceData = id => {

	// attempt to load a previously saved instance with the given ID
	try {
		return JSON.parse(fs.readFileSync(path.join(qsets, id+'.instance.json')).toString());
	} catch (e) {
		console.log(`creating qset ${id}`)
		// console.error(e)
	}

	// generate a new instance with the given ID
	let qset = getDemoQset()
	let widget = createApiWidgetData(id);

	return [{
		'attempts': '-1',
		'clean_name': '',
		'close_at': '-1',
		'created_at': Math.floor(Date.now() / 1000),
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
	}];
};

// Build a mock widget data structure
var createApiWidgetData = (id) => {
	let widget = yaml.parse(getInstall().toString());

	//provide default values where necessary
	if ( ! widget.meta_data.features) widget.meta_data.features = [];
	if ( ! widget.meta_data.supported_data) widget.meta_data.features = [];

	widget.player = widget.files.player;
	widget.creator = widget.files.creator;
	widget.clean_name = getWidgetCleanName();
	// widget.dir = widget.clean_name + '/';
	widget.dir = ''
	widget.width = widget.general.width;
	widget.height = widget.general.height;
	return widget;
};

// run yarn build in production mode to build the widget
var buildWidget = () => {
	try{
		console.log('Building production ready widget')
		let output = execSync('yarn run build')
	} catch(e) {
		console.error(e)
		console.log(output.toString())
		return res.send("There was an error building the widget")
	}

	let widgetData = createApiWidgetData();
	let widgetPath = path.resolve('build', '_output', `${widgetData.clean_name}.wigt`)

	return {
		widgetPath: widgetPath,
		widgetData: widgetData
	}
}

var getInstall = () => {
	try {
		if(process.env.TEST_MWDK) return fs.readFileSync(path.resolve('views', 'sample-install.yaml')); // short circuit for tests
		return getFileFromWebpack('install.yaml', true);
	} catch(e) {
		console.error(e)
		throw "Can't find install.yaml"
	}
}

var getWidgetCleanName = () => {
	try {
		let packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json')));
		return packageJson.materia.cleanName.toLowerCase();
	} catch(e) {
		console.error(e)
		throw "Can't resolve clean name from package.json!"
	}
}

// goes through the master list of default questions and filters according to a given type/types
var getAllQuestions = (type) => {
	type = type.replace('Multiple%20Choice', 'MC');
	type = type.replace('Question%2FAnswer', 'QA');
	const types = type.split(',');

	const qlist = [];

	const obj = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'mwdk_questions.json')).toString());
	let i = 1;

	const qarr = obj.set;
	for (let q of Array.from(qarr)) {
		q.id = i++;
		if (!Array.from(types).includes(q.type)) { continue; }
		qlist.push({
			id: q.id,
			type: q.type,
			text: q.questions[0].text,
			uses: Math.round(Math.random() * 1000),
			created_at: Date.now()
		});
	}

	return qlist;
};

// pulls a question/questions out of the master list of default questions according to specified ID/IDs
var getQuestion = (ids) => {
	// convert the given ids to numbers
	ids = ids.map(id => +id);

	const qlist = [];

	const obj = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'mwdk_questions.json')).toString());
	let i = 1;

	const qarr = obj.set;
	for (let q of Array.from(qarr)) {
		q.id = i++;
		if (!Array.from(ids).includes(+q.id)) { continue; }
		qlist.push({
			id: q.id,
			type: q.type,
			created_at: Date.now(),
			questions: q.questions,
			answers: q.answers,
			options: q.options,
			assets: q.assets
		});
	}

	return qlist;
};

const INSTALL_TYPE_NUMBER = 'number'
const INSTALL_TYPE_BOOLEAN = 'boolean'
const INSTALL_TYPE_STRING = 'string'
const INSTALL_TYPE_ARRAY = 'object'

const verifyInstallProp = (prop, desiredType) => {
	const propType = typeof prop
	if(propType === 'undefined' || propType === 'null') return false
	if(desiredType === INSTALL_TYPE_BOOLEAN) {
		//yaml parser interprets all valid YAML boolean values as strings
		if(propType !== 'string') return false
		//if we want a boolean, make sure the string we got is one of the accepted YAML boolean strings
		const match = prop.match(/^(y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF){1}$/)
		if(!match) return false
	}
	if(desiredType === INSTALL_TYPE_STRING && propType !== 'string') return false
	if(desiredType === INSTALL_TYPE_NUMBER && propType !== 'number') return false
	if(desiredType === INSTALL_TYPE_ARRAY) {
		if(propType !== 'object') return false
		if(prop.length < 1) return false
	}
	return true
}

// app is passed a reference to the webpack dev server (Express.js)
module.exports = (app) => {

	// ============= ASSETS and SETUP =======================

	app.set('view engine', 'html') // set file extension to html
	app.set('layout', 'layout') // set layout to layout.html
	app.engine('html', hoganExpress) // set the layout engine for html
	app.set('views', path.join(__dirname , 'views')); // set the views directory

	// the web pack middlewere takes time to show up
	app.use([/^\/$/, '/mwdk/*', '/api/*'], (req, res, next) => { waitForWebpack(app, next) })

	// allow express to parse a JSON post body that ends up in req.body.data
	app.use(express.json()); // for parsing application/json
	app.use(express.urlencoded({extended: true})); // for parsing application/x-www-form-urlencoded

	// serve the static files from devmateria
	let clientAssetsPath = require('materia-server-client-assets/path')
	app.use('/favicon.ico', express.static(path.join(__dirname, 'assets', 'img', 'favicon.ico')))
	app.use('/mwdk/assets', express.static(path.join(__dirname, 'assets')))
	app.use('/mwdk/mwdk-assets/js', express.static(path.join(__dirname, 'build')))
	app.use('/mwdk/assets/', express.static(path.join(clientAssetsPath, 'dist')))


	// insert the port into the res.locals
	app.use( (req, res, next) => {
		// console.log(`request to ${req.url}`)
		res.locals.port = process.env.PORT || 8118
		next()
	})

	// ============= ROUTES =======================

	// Display index page
	app.get('/', (req, res) => {
		res.locals = Object.assign(res.locals, {template: 'index', title: getWidgetTitle()})
		res.render(res.locals.template)
	});

	// ============= MWDK ROUTES =======================

	app.get('/mwdk/my-widgets', (req, res) => {
		res.redirect('/')
	});

	// Match any MEDIA URLS that get build into our demo.jsons
	// worth noting the <MEDIA=dfdf> is converted to __dfdf__
	// this redirects the request directly to the file served by webpack
	app.get(/\/mwdk\/media\/__(.+)__/, (req, res) => {
		console.log(`mocking media asset from demo.json :<MEDIA='${req.params[0]}'>`)
		res.redirect(`http://localhost:${res.locals.port}/${req.params[0]}`)
	})

	app.get('/mwdk/media/import', (req, res) => {
		res.locals = Object.assign(res.locals, { template: 'media_importer'})
		res.render(res.locals.template)
	})

	// If asking for a media item by id, determine action based on requested type
	app.get('/mwdk/media/:id', (req, res) => {
		const filetype = (req.params.id).match(/\.[0-9a-z]+$/i)
		// TODO: have a small library of assets for each file type and pull a random one when needed?
		switch (filetype[0]) {
			case '.mp4':
				res.redirect('https://commondatastorage.googleapis.com/gtv-videos-bucket/CastVideos/dash/BigBuckBunnyVideo.mp4')
				break
			case '.mp3':
				// audio: serve up a generic .mp3 file
				res.sendFile(path.join(__dirname, 'assets', 'media', 'birds.mp3'))
				break;
			case '.png':
			case '.jpg':
			case '.jpeg':
			case '.gif':
			default:
				// images: grab a random image from Lorem Picsum
				res.redirect(`https://picsum.photos/800/600/?c=${req.params.id}`);
				break;
		}
	})

	// route to list the saved qsets
	app.use('/mwdk/saved_qsets', (req, res) => {
		const saved_qsets = {};

		const files = fs.readdirSync(qsets);
		for (let i in files) {
			const file = files[i]

			if (!file.includes('instance')){
				continue;
			}

			const actual_path = path.join(qsets, file);
			const qset_data = JSON.parse(fs.readFileSync(actual_path).toString())[0];
			saved_qsets[qset_data.id] = qset_data.name;
		}

		res.json(saved_qsets);
	});

	// The play page frame that loads the widget player in an iframe
	app.get(['/mwdk/player/:instance?', '/mwdk/preview/:instance?'], (req, res) => {
		res.locals = Object.assign(res.locals, { template: 'player_mwdk', instance: req.params.instance || 'demo'})
		res.render(res.locals.template)
	});

	// Play Score page
	app.get(['/mwdk/scores/demo', '/mwdk/scores/preview/:id'], (req, res) => {
		res.locals = Object.assign(res.locals, { template: 'score_mwdk'})
		res.render(res.locals.template)
	})

	// The create page frame that loads the widget creator
	app.get('/mwdk/widgets/1-mwdk/:instance?', (req, res) => {
		res.locals = Object.assign(res.locals, {template: 'creator_mwdk', instance: req.params.instance || null})
		res.render(res.locals.template)
	});

	// Show the package options
	app.get('/mwdk/package', (req, res) => {
		let status = {
			demo: 'unknown',
			install: 'unknown',
			screenshot: 'unknown',
			icon: 'unknown',
			scoreModule: 'unknown',
			creatorCallback: 'unknown',
			playerCallback: 'unknown',
			scoreScreenCallback: 'unknown'
		}
		let action = {
			demo: '',
			install: '',
			screenshot: '',
			icon: '',
			scoreModule: '',
			creatorCallback: '',
			playerCallback: '',
			scoreScreenCallback: ''
		}
		let allGood = true
		//check demo.json
		try {
			const demo = JSON.parse(getFileFromWebpack('demo.json').toString())

			if(!demo.name) {
				status.demo = 'fail'
				action.demo = "'name' property missing"
			} else if(!demo.qset) {
				status.demo = 'fail'
				action.demo = "'qset' property missing"
			} else if(!demo.qset.version) {
				status.demo = 'fail'
				action.demo = "'qset' 'version' property missing"
			} else if(!demo.qset.data) {
				status.demo = 'fail'
				action.demo = "'qset' 'data' property missing"
			} else {
				status.demo = 'pass'
			}
		} catch(error) {
			//TODO: use the error object to determine why there was a failure
			// maybe move the failure contextualization from the try to the catch
			status.demo = 'fail'
			action.demo = "demo.json missing or can't be parsed"
		}

		//check install.yaml
		//scope this so we can use it for other checks later
		let install = null
		try {
			install = yaml.parse(getInstall().toString())
			if(!install.general) {
				status.install = 'fail'
				action.install = "'general' property missing"
			} else if(!verifyInstallProp(install.general.name, INSTALL_TYPE_STRING)) {
				status.install = 'fail'
				action.install = "'general' 'name' property missing or not a string"
			} else if(!verifyInstallProp(install.general.group, INSTALL_TYPE_STRING)) {
				status.install = 'fail'
				action.install = "'general' 'group' property missing or not a string"
			} else if(!verifyInstallProp(install.general.height, INSTALL_TYPE_NUMBER)) {
				status.install = 'fail'
				action.install = "'general' 'height' property missing or not a number"
			} else if(!verifyInstallProp(install.general.width, INSTALL_TYPE_NUMBER)) {
				status.install = 'fail'
				action.install = "'general' 'width' property missing or not a number"
			} else if(!verifyInstallProp(install.general.in_catalog, INSTALL_TYPE_BOOLEAN)) {
				status.install = 'fail'
				action.install = "'general' 'in_catalog' property missing or not a boolean"
			} else if(!verifyInstallProp(install.general.is_editable, INSTALL_TYPE_BOOLEAN)) {
				status.install = 'fail'
				action.install = "'general' 'is_editable' property missing or not a boolean"
			} else if(!verifyInstallProp(install.general.is_playable, INSTALL_TYPE_BOOLEAN)) {
				status.install = 'fail'
				action.install = "'general' 'is_playable' property missing or not a boolean"
			} else if(!verifyInstallProp(install.general.is_qset_encrypted, INSTALL_TYPE_BOOLEAN)) {
				status.install = 'fail'
				action.install = "'general' 'is_qset_encrypted' property missing or not a boolean"
			} else if(!verifyInstallProp(install.general.api_version, INSTALL_TYPE_NUMBER)) {
				status.install = 'fail'
				action.install = "'general' 'api_version' property missing or not a number"
			} else if(!install.files) {
				status.install = 'fail'
				action.install = "'files' property missing"
			} else if(!verifyInstallProp(install.files.creator, INSTALL_TYPE_STRING)) {
				status.install = 'fail'
				action.install = "'files' 'creator' property missing or not a string"
			} else if(!verifyInstallProp(install.files.player, INSTALL_TYPE_STRING)) {
				status.install = 'fail'
				action.install = "'files' 'player' property missing or not a string"
			} else if(!verifyInstallProp(install.files.flash_version, INSTALL_TYPE_NUMBER)) {
				status.install = 'fail'
				action.install = "'files' 'flash_version' property missing or not a number"
			} else if(!install.score) {
				status.install = 'fail'
				action.install = "'score' property missing"
			} else if(!verifyInstallProp(install.score.is_scorable, INSTALL_TYPE_BOOLEAN)) {
				status.install = 'fail'
				action.install = "'score' 'is_scorable' property missing or not a boolean"
			} else if(!verifyInstallProp(install.score.score_module, INSTALL_TYPE_STRING)) {
				status.install = 'fail'
				action.install = "'score' 'score_module' property missing or not a string"
			} else if(install.score.score_screen && !verifyInstallProp(install.score.score_screen, INSTALL_TYPE_STRING)) {
				//custom score screens are optional
				status.install = 'fail'
				action.install = "'score' 'score_screen' property not a string"
			} else if(!install.meta_data) {
				status.install = 'fail'
				action.install = "'meta_data' property missing"
			} else if(!verifyInstallProp(install.meta_data.features, INSTALL_TYPE_ARRAY)) {
				status.install = 'fail'
				action.install = "'meta_data' 'features' property missing, not an array, or empty"
			} else if(!verifyInstallProp(install.meta_data.supported_data, INSTALL_TYPE_ARRAY)) {
				status.install = 'fail'
				action.install = "'meta_data' 'supported_data' property missing, not an array, or empty"
			} else if(!verifyInstallProp(install.meta_data.about, INSTALL_TYPE_STRING)) {
				status.install = 'fail'
				action.install = "'meta_data' 'about' property missing or not a string"
			} else if(!verifyInstallProp(install.meta_data.excerpt, INSTALL_TYPE_STRING)) {
				status.install = 'fail'
				action.install = "'meta_data' 'excerpt' property missing or not a string"
			} else {
				status.install = 'pass'
			}
		} catch(error) {
			status.install = 'fail'
			action.install = "install.yaml missing or can't be parsed"
		}

		status.screenshot = 'pass'
		//check screenshots
		for(let i = 1; i <= 3; i++) {
			try {
				getFileFromWebpack(path.join('img','screen-shots',`${i}.png`))
			} catch(error) {
				status.screenshot = 'fail'
				action.screenshot = `file 'src/_screen-shots/${i}.png' missing`
			}
			try {
				getFileFromWebpack(path.join('img','screen-shots',`${i}-thumb.png`))
			} catch(error) {
				status.screenshot = 'fail'
				action.screenshot = `file 'src/_screen-shots/${i}-thumb.png' missing`
			}
		}

		//check icons
		const iconSizes = [60,92,275,394]
		status.icon = 'pass'
		iconSizes.forEach(size => {
			try {
				getFileFromWebpack(path.join('img',`icon-${size}.png`))
			} catch(error) {
				status.icon = 'fail'
				action.icon = `file 'src/_icons/icon-${size}.png' missing`
			}
			try {
				getFileFromWebpack(path.join('img',`icon-${size}@2x.png`))
			} catch(error) {
				status.icon = 'fail'
				action.icon = `file 'src/_icons/icon-${size}@2x.png' missing`
			}
		})

		//check score module
		if(install && install.score.score_module) {
			try {
				//running regular expressions on a string representation of the score module should be good enough
				const scoreModule = getFileFromWebpack(path.join('_score-modules', 'score_module.php')).toString()

				const phpOpenMatch = scoreModule.match(/^<\?php$/gm)
				const namespaceMatch = scoreModule.match(/^namespace Materia;$/gm)
				//get the name of the score module this widget uses from install.yaml
				const classCheck = new RegExp(`^class Score_Modules_${install.score.score_module} extends Score_Module$`, 'gm')
				const classMatch = scoreModule.match(classCheck)
				const functionMatch = scoreModule.match(/^\t{1}public function check_answer\(\$(\w)+\)$/gm)
				if(!phpOpenMatch || phpOpenMatch.length > 1) {
					status.scoreModule = 'fail'
					action.scoreModule = "'<?php' missing or used more than once"
				} else if(!namespaceMatch || namespaceMatch.length > 1) {
					status.scoreModule = 'fail'
					action.scoreModule = "'namespace Materia;' missing or used more than once"
				} else if(!classMatch || classMatch.length > 1) {
					status.scoreModule = 'fail'
					action.scoreModule = `score module class 'Score_Modules_${install.score.score_module}' was not defined or defined more than once`
				} else if(!functionMatch || functionMatch > 1) {
					status.scoreModule = 'fail'
					action.scoreModule = "'check_answer' function was not defined or defined more than once"
				} else {
					status.scoreModule = 'pass'
				}

			} catch(error) {
				status.scoreModule = 'fail'
				action.scoreModule = "score module missing or can't be parsed"
			}
		} else {
			//if we can't get the name of the score module we need, we can't check validity
			//this shouldn't ever happen if the whole install.yaml check block passes
			action.scoreModule = "can't verify score module name from install.yaml"
		}

		//check creator callbacks
		if(install.files.creator != 'default') {
			try {
				const creator = getFileFromWebpack('creator.js').toString()
				let missingCreatorCalls = []
				const neededCreatorCallbacks = [
					'initNewWidget',
					'initExistingWidget',
					'onMediaImportComplete',
					'onQuestionImportComplete',
					'onSaveClicked',
					'onSaveComplete'
				]
				neededCreatorCallbacks.forEach(callback => {
					const callbackCheck = new RegExp(`(function ${callback}){1}|(${callback} = function){1}`, 'g')
					const callbackMatch = creator.match(callbackCheck)
					if(!callbackMatch || callbackMatch.length > 1) {
						status.creatorCallback = 'fail'
						action.creatorCallback = `'${callback}' method missing or defined more than once`
						missingCreatorCalls.push(callback)
					}
				})
				const neededCreatorCoreCalls = [
					'save',
					// 'cancelSave',
					'start'
				]
				neededCreatorCoreCalls.forEach(coreCall => {
					const coreCallCheck = new RegExp(`Materia.CreatorCore.${coreCall}`, 'g')
					const coreCallMatch = creator.match(coreCallCheck)
					if(!coreCallMatch || coreCallMatch.length > 1) {
						status.creatorCallback = 'fail'
						action.creatorCallback = `CreatorCore '${coreCall}' method never called`
						missingCreatorCalls.push(coreCall)
					}
				})
				if(missingCreatorCalls.length == 0) status.creatorCallback = 'pass'
			} catch(error) {
				status.creatorCallback = 'fail'
				action.creatorCallback = "creator source code missing or can't be parsed"
			}
		} else {
			status.creatorCallback = 'pass'
			action.creatorCallback = 'widget using default creator'
		}

		//check player callbacks
		try {
			const player = getFileFromWebpack('player.js').toString()
			const playerSaveMatch = player.match(/Materia.Engine.start/g)
			if(!playerSaveMatch || playerSaveMatch > 1) {
				status.playerCallback = 'fail'
				action.playerCallback = "EngineCore 'start' method missing or called more than once"
			} else {
				status.playerCallback = 'pass'
			}
		} catch(error) {
			status.playerCallback = 'fail'
			action.playerCallback = "player source code missing or can't be parsed"
		}

		//check score screen callbacks
		if(install.score.score_screen) {
			const scoreScreen = getFileFromWebpack('scorescreen.js').toString()
			let missingScoreScreenCalls = []
			const neededScoreScreenCallbacks = [
				'start',
				'update'
			]
			neededScoreScreenCallbacks.forEach(callback => {
				const callbackCheck = new RegExp(`(function ${callback}){1}|(${callback} = function){1}`, 'g')
				const callbackMatch = scoreScreen.match(callbackCheck)
				if(!callbackMatch || callbackMatch.length > 1) {
					status.scoreScreenCallback = 'fail'
					action.scoreScreenCallback = `'${callback}' method missing or defined more than once`
					missingScoreScreenCalls.push(callback)
				}
			})
			const neededScoreCoreCalls = [
				// 'hideScoresOverview',
				// 'hideResultsTable',
				'start'
			]
			neededScoreCoreCalls.forEach(coreCall => {
				const coreCallCheck = new RegExp(`Materia.ScoreCore.${coreCall}`, 'g')
				const coreCallMatch = scoreScreen.match(coreCallCheck)
				if(!coreCallMatch || coreCallMatch.length > 1) {
					status.scoreScreenCallback = 'fail'
					action.scoreScreenCallback = `ScoreCore '${coreCall}' method never called`
					missingScoreScreenCalls.push(coreCall)
				}
			})
			if(missingScoreScreenCalls.length == 0) status.scoreScreenCallback = 'pass'
		} else {
			status.scoreScreenCallback = 'pass'
			action.scoreScreenCallback = 'widget not using custom score screen'
		}

		const checklist = [
			{
				status: status.demo,
				text: 'demo.json found and valid',
				action: action.demo,
			},
			{
				status: status.install,
				text: 'install.yaml found and valid',
				action: action.install,
			},
			{
				status: status.screenshot,
				text: 'screenshots found',
				action: action.screenshot,
			},
			{
				status: status.icon,
				text: 'icons files found',
				action: action.icon,
			},
			{
				status: status.scoreModule,
				text: 'score module found and valid',
				action: action.scoreModule,
			},
			{
				status: status.creatorCallback,
				text: 'creator callbacks registered',
				action: action.creatorCallback,
			},
			{
				status: status.playerCallback,
				text: 'player callbacks registered',
				action: action.playerCallback,
			},
			{
				status: status.scoreScreenCallback,
				text: 'score screen callbacks registered',
				action: action.scoreScreenCallback,
			},
		]

		//do one more pass over the whole checklist - if there are any failures, prevent build/install
		checklist.forEach(item => {
			if(item.status == 'fail') allGood = false
		})

		res.locals = Object.assign(res.locals, {template: 'download', checklist: checklist, allGood: allGood})
		res.render(res.locals.template)
	})

	// Build and download the widget file
	app.get('/mwdk/download', (req, res) => {
		let { widgetPath, widgetData } = buildWidget()
		res.set('Content-Disposition', `attachment; filename=${widgetData.clean_name}.wigt`);
		res.send(fs.readFileSync(widgetPath));
	});

	// Question importer for creator
	app.get('/mwdk/questions/import/', (req, res) => {
		res.locals = Object.assign(res.locals, {template: 'question_importer'})
		res.render(res.locals.template)
	});

	// A default preview blocked template if a widget's creator doesnt have one
	// @TODO im not sure this is used?
	app.get('/mwdk/preview_blocked/:instance?', (req, res) => {
		res.locals = Object.assign(res.locals, {template: 'preview_blocked', instance: req.params.instance || 'demo'})
		res.render(res.locals.template)
	});

	app.get('/mwdk/install', (req, res) => {
		res.write('<html><body><pre>');
		// Find the docker-compose container for materia-web
		// 1. lists all containers
		// 2. filter for materia-web image and named xxxx_phpfpm_1 name
		// 3. pick the first line
		// 4. pick the container name
		let targetImage = execSync('docker ps -a --format "{{.Image}} {{.Names}}" | grep -e ".*materia-web-base:.* materia-phpfpm" | head -n 1 | cut -d" " -f2');
		if(!targetImage){
			throw "MWDK Couldn't find a docker container using a 'materia-web' image named 'phpfpm'."
		}
		targetImage = targetImage.toString().trim();
		res.write(`> Using Docker image '${targetImage}' to install widgets<br/>`);

		// get the image information
		let containerInfo = execSync(`docker inspect ${targetImage}`);
		containerInfo = JSON.parse(containerInfo.toString());

		// Find mounted volume that will tell us where materia is on the host system
		let found = containerInfo[0].Mounts.filter(m => m.Destination === '/var/www/html')
		if(!found){
			res.write(`</pre><h1>Cant Find Materia</h1>`);
			throw `MWDK Couldn't find the Materia mount on the host system'`
		}
		let materiaPath = found[0].Source;
		let serverWidgetPath = `${materiaPath}/fuel/app/tmp/widget_packages`

		// make sure the dir exists
		if(!fs.existsSync(serverWidgetPath)){
			fs.mkdirSync(serverWidgetPath);
		}

		// Build!
		res.write(`> Building widget<br/>`);
		let { widgetPath, widgetData } = buildWidget()

		// create a file name with a timestamp in it
		const filename = `${widgetData.clean_name}-${new Date().getTime()}.wigt`;

		// get the widget I just built
		let widgetPacket = fs.readFileSync(widgetPath)

		// write the built widget to that path
		let target = path.join(serverWidgetPath, filename)
		res.write(`> Writing to ${target}<br/>`);
		fs.writeFileSync(target, widgetPacket);

		// run the install command
		res.write(`> Running run_widgets_install.sh script<br/>`);
		let installResult = execSync(`cd ${materiaPath}/docker/ && ./run_widgets_install.sh ${filename}`);
		installResult = installResult.toString();
		res.write(installResult.replace("\n", "<br/>"));
		console.log(installResult);

		// search for success in the output
		const match = installResult.match(/Widget installed\:\ ([A-Za-z0-9\-\/]+)/);

		res.write("</pre>");
		if(match && match[1]) {
			res.write("<h2>SUCCESS!<h2/>");
		}
		else{
			res.write("<h2>Something failed!<h2/>");
		}

		res.write('<a onclick="window.parent.MWDK.Package.cancel();"><button>Close</button></a></body></html>');
		res.end()
	});

	// ============= MOCK API ROUTES =======================

	// API endpoint for getting the widget instance data
	app.use('/api/json/widget_instances_get', (req, res) => {
		const id = JSON.parse(req.body.data)[0][0];
		res.json(createApiWidgetInstanceData(id));
	});

	app.use('/api/json/widget_publish_perms_verify', (req, res) => {
		res.json(true);
	})

	app.use('/api/json/widget_instance_lock', (req, res) => {
		res.json(true)
	})

	app.use('/api/json/widgets_get', (req, res) => {
		const id = JSON.parse(req.body.data);
		res.json([createApiWidgetData(id)]);
	});

	app.use('/api/json/question_set_get', (req, res) => {

		res.set('Content-Type', 'application/json')
		// load instance, fallback to demo
		try {
			const id = JSON.parse(req.body.data)[0];
			let qset = fs.readFileSync(path.join(qsets, id+'.json')).toString()
			qset = performQSetSubsitutions(qset)
			qset = JSON.stringify(qset)
			res.send(qset.toString());
		} catch (e) {
			res.json(getDemoQset().qset);
		}
	});

	app.use(['/api/json/session_play_verify', '/api/json/session_author_verify'] , (req, res) => res.send('true'));

	app.use('/api/json/play_logs_save', (req, res) => {
		const logs = JSON.parse(req.body.data)[1];
		console.log("========== Play Logs Received ==========\r\n", logs, "\r\n============END PLAY LOGS================");
		res.json({score: 0});
	});

	// api mock for saving widget instances
	// creates files in our qset directory (probably should use a better thing)session
	app.use(['/api/json/widget_instance_new', '/api/json/widget_instance_update'], (req, res) => {
		const data = JSON.parse(req.body.data);

		// sweep through the qset items and make sure there aren't any nonstandard question properties
		const standard_props = [
			'materiaType',
			'id',
			'type',
			'created_at',
			'questions',
			'answers',
			'options',
			'assets',
			'items' //some widgets double-nest 'items'
		];

		const nonstandard_props = [];

		for (let index in data[2].data.items) {
			const item = data[2].data.items[index];

			for (let prop in item) {
				if (!Array.from(standard_props).includes(prop)) {
					nonstandard_props.push(`"${prop}"`);
					console.log(`Nonstandard property found in qset: ${prop}`);
				}
			}
		}

		const id = data[0] || new Date().getTime();
		fs.writeFileSync(path.join(qsets, id + '.json'), JSON.stringify(data[2]));

		const instance = createApiWidgetInstanceData(data[0])[0];
		instance.id = id;
		instance.name = data[1];

		fs.writeFileSync(path.join(qsets, id + '.instance.json'), JSON.stringify([instance]));

		// send a warning back to the creator if any nonstandard question properties were detected
		if (nonstandard_props.length > 0) {
			const plurals = nonstandard_props.length > 1 ? ['properties', 'were'] : ['property', 'was'];
			console.log ('Warning: Nonstandard qset item ' +
				plurals[0] + ' ' + nonstandard_props.join(', ') + ' ' +
				plurals[1]);
		}

		res.json(instance);
	});

	// API mock for getting questions for the question importer
	app.use('/api/json/questions_get/', (req, res) => {
		const given = JSON.parse(req.body.data);
		let questions
		if (given[0]) {
			// we selected specific questions
			questions = getQuestion(given[0])
		} else {
			// we just want all of them from the given type
			questions = getAllQuestions(given[1])
		}

		res.json(questions)
	});

}
