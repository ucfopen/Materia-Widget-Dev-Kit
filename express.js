const path                 = require('path');
const fs                   = require('fs');
const express              = require('express')
const qsets                = path.join(__dirname, 'qsets');
const yaml                 = require('yamljs');
const { execSync }         = require('child_process');
const waitUntil            = require('wait-until-promise').default
const { v4: uuidv4 }       = require('uuid')
const sharp                = require('sharp')
const util                 = require('util');
const cors                 = require('cors')
const hbs                  = require('hbs');
const pyodide              = require('pyodide')

// common paths used here
const outputPath           = path.join(process.cwd(), 'build') + path.sep

// Determine if webpack.config.cjs is present, and if so, use that instead of .js
const wpConfJsLocation 		 = path.resolve(process.cwd(), './webpack.config.js');
const wpConfCjsLocation 	 = path.resolve(process.cwd(), './webpack.config.cjs');
const webpackConfLocation  = fs.existsSync(wpConfCjsLocation) ? wpConfCjsLocation : wpConfJsLocation;

// Webpack middleware setup
const webpack              = require('webpack');
const webpackDevMiddleware = require('webpack-dev-middleware');
const config               = require(webpackConfLocation);
const compiler = webpack(config);


const webpackMiddleware = webpackDevMiddleware(compiler, {
	publicPath: config.output.publicPath,
})

let hasCompiled = false;
let hasSampleScoreData = false;
let customScoreScreen = null;

// this will call next() once webpack is ready by trying to:
// 1. talk to the middlware
// 2. load the widget's install.yaml from webpack's in-memory files
// 3. initiate the widget's demo.json from webpack's in-memory files into qsets
const waitForWebpack = async (app, next) => {
	if(hasCompiled) return next(); // short circuit if ready

	waitUntil(() => {
		try {
			getInstall()
			// clean up
			fs.readdir(qsets, async (err, files) => {
				if (err) throw err;
				// don't delete existing qset files on startup
				//  consider reinstituting this after pyodide dev is done
				// for (const file of files) {
				// 	if (file == '.gitkeep') continue
				// 	console.log("removing file: " + file)
				// 	await fs.promises.unlink(path.join(qsets, file), (err) => {
				// 		if (err) throw err;
				// 	});
				// }
				try {
					await fs.promises.unlink(path.join(qsets,'demo.json'))
					await fs.promises.unlink(path.join(qsets,'demo.instance.json'))
				} catch(e) {
					console.log('demo.json and demo.instance.json already did not exist')
				}

				console.log("creating demo instance")
				const instance = createApiWidgetInstanceData('demo', true);
				instance.id = 'demo'

				if (process.env.TEST_MWDK) {
					fs.copyFileSync('sample-demo.json', path.join(qsets, 'demo.json'));
				} else {
					fs.writeFileSync(path.join(qsets, 'demo.instance.json'), JSON.stringify(instance));
					fs.writeFileSync(path.join(qsets, 'demo.json'), JSON.stringify(instance.qset)); // must use instance.qset so IDs match
				}

			});
			return true
		} catch(e) {
			console.log("waiting for 'install.yaml' to be served by webpack")
			return false
		}
	}, 15000, 250)
	.then(() => {
		hasCompiled = true // so we don't check again
		return next();
	})
	.catch((error) => {
		throw "MWDK couldn't locate the widget's install.yaml.  Make sure you have one and webpack is processing it."
	})
}

// Loads processed widget files from webpack's memory
const getFileFromWebpack = (file, quiet = false) => {
	try {
		// pull the specified filename out of memory
		if(process.env.TEST_MWDK){
			return compiler.outputFileSystem.readFileSync(path.join('build', file));
		}
		else {
			return compiler.outputFileSystem.readFileSync(path.join(outputPath, file));
		}
	} catch (e) {
		if (!quiet) console.warn(`requested file not available from webpack: ${file}`)
		return false
	}
}

// Widget creation/management support functions
const getWidgetTitle = () => {
	const install = getInstall()
	return yaml.parse(install.toString()).general.name;
};

const getDemoQset = () => {
	// generate a new instance with the given ID
	let qset
	try {
		// see if demo has been initialized
		qset = fs.readFileSync(path.join(qsets, 'demo.json'))
	} catch (e) {
		console.log("demo.json file not initialized")
		try {
			if(process.env.TEST_MWDK){
				console.log("getting sample-demo.json")
				qset = fs.readFileSync('sample-demo.json')
			}
			else{
				console.log("getting demo.json")
				qset = getFileFromWebpack('demo.json')
			}
		} catch (err) {
			console.log("error getting demo.json")
			console.log(err)
		}
	}

	return performQSetSubsitutions(qset.toString())
}

const performQSetSubsitutions = (qset) => {
	console.log('media and ids inserted into qset..')
	// convert media urls into usable ones
	qset = qset.replace(/"<%MEDIA='(.+?)'%>"/g, '"__$1__"')

	// look for "id": null or "id": 0 or "id": "" and build a mock id
	qset = qset.replace(/("id"\s?:\s?)(null|0|"")/g, () => `"id": "mwdk-mock-id-${uuidv4()}"`)

	return JSON.parse(qset)
}

// enforce qsets to have the same structure as they would in production materia
const standardizeObject = (obj, standardKeys, type = "qset") => {
	const existingValidKeys = Object.keys(obj).filter((key) => {
		if (standardKeys.includes(key)) return true
		console.log(`Found invalid key in ${type}: ${key}`)
	})

	const standardizedObj = {}
	existingValidKeys.forEach((key) => standardizedObj[key] = obj[key])
	return standardizedObj
}

const isQuestion = (potentialQ, ignoreId = false) => {
	// A copy of instance.php's is_question
	if (!potentialQ) return false // Do not process if null/undefined
	if ((!ignoreId && !potentialQ.id) || !potentialQ.type || !potentialQ.questions || !potentialQ.answers)
		return false;

	if (typeof potentialQ.questions !== 'object' || typeof potentialQ.answers !== 'object')
		return false

	if (potentialQ.questions.length === 0 || potentialQ.answers.length === 0)
		return false

	return true
}

const performQsetQuestionStandardization = (questionItem) => {
	// Data on what a question should contain is taken from Materia's question.php
	// Enforce question structures for each item
	const standardQuestionProperties = ['text', 'assets']
	questionItem.questions = questionItem.questions.map((question) => {
		return standardizeObject(question, standardQuestionProperties, "question object")
	})

	// Enforce answer structures for each item
	const standardAnswerProperties = ['id', 'text', 'value', 'options', 'assets']
	questionItem.answers = questionItem.answers.map((answer) => {
		return standardizeObject(answer, standardAnswerProperties, "answer object")
	})

	// Construct and return new validated item object
	const standardItemProperties = ['materiaType', 'id', 'type', 'createdAt', 'questions', 'answers', 'options', 'assets']
	const standardizedItem = standardizeObject(questionItem, standardItemProperties, "question item object")

	return standardizedItem
}

const findQuestions = (potentialQ, ignoreId = false) => {
	// A copy of instance.php's find_question
	if (!potentialQ || typeof potentialQ !== 'object') return []
	let results = []

	// go through each item in the array/object
	Object.entries(potentialQ).forEach(([_, value]) => {
		if (isQuestion(value, ignoreId)) {
			// standardize the question item object
			results.push(value)
		} else if (value && typeof value === 'object') {
			// inception!!!
			results = [...results, ...findQuestions(value, ignoreId)]
		}
	})

	return results
}

const findAndStandardizeQuestions = (potentialQ) => {
	findQuestions(potentialQ).forEach(performQsetQuestionStandardization)
}

// create a widget instance data structure
const createApiWidgetInstanceData = (id) => {
	// attempt to load a previously saved instance with the given ID
	try {
		let savedInstance = JSON.parse(fs.readFileSync(path.join(qsets, id+'.instance.json')))
		// add id's to the qset questions
		if (hasSampleScoreData) {
			try {
				// get sample data file
				let scoreDataFile = fs.readFileSync(path.join(qsets, 'sample_score_data.json')).toString()
				let sample_score_data = JSON.parse(scoreDataFile)
				sample_score_data[0].details[0].table.forEach((log, i) => {
					const index = log.data_style.indexOf("question_id")
					if (index >= 0) {
						const id = log.data[index]
						savedInstance.qset.data.items[i].id = id
					}
				})
				// update qset file
				fs.writeFileSync(path.join(qsets, id+'.json'), JSON.stringify(savedInstance.qset))
				console.log("added IDs to instance qset from sample score data file")
			} catch (err) {
				console.log("failed to edit instance qset with sample score data")
			}
		}

		// edit widget.score_screen
		if (customScoreScreen && hasSampleScoreData) {
			savedInstance.widget.score_screen = customScoreScreen
		}

		return savedInstance
	} catch (e) {
		console.log(`creating instance qset ${id}`)
		// console.error(e)
	}

	// generate a new instance with the given ID
	let qset = {
		'version': null,
		'data': null
	}

	let demoQset = getDemoQset()
	let widget = createApiWidgetData(id);

	if (id == "demo") {
		qset = demoQset.qset
	}

	return {
		'attempts': '-1',
		'clean_name': '',
		'close_at': '-1',
		'created_at': Math.floor(Date.now() / 1000),
		'embed_url': '',
		'guest_access': true,
		'height': 0,
		'id': id,
		'is_draft': true,
		'name': demoQset.name,
		'open_at': '-1',
		'play_url': '',
		'preview_url': '',
		'qset': qset,
		'user_id': '1',
		'widget': widget,
		'width': 0
	};
};

// Build a mock widget data structure
const createApiWidgetData = (id) => {
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
	widget.href = '/preview/' + id
	if (widget.score.score_screen) {
		customScoreScreen = widget.score.score_screen;
		// in Materia proper the Widget model features score_screen as its own property
		widget.score_screen = widget.score.score_screen;
	}
	// attach everything from 'general' directly to the widget object itself
	for (const [genKey, genVal] of Object.entries(widget.general)) {
		widget[genKey] = genVal
	}
	widget.id = 1

	return widget;
};

// run yarn build in production mode to build the widget
const buildWidget = () => {
	let output = '';
	try{
		console.log('Building production ready widget')
		output = execSync('yarn build')
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

const getInstall = () => {
	try {
		if(process.env.TEST_MWDK) return fs.readFileSync('sample-install.yaml'); // short circuit for tests
		return getFileFromWebpack('install.yaml', true);
	} catch(e) {
		console.error(e)
		throw "Can't find install.yaml"
	}
}

const getWidgetCleanName = () => {
	try {
		let packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json')));
		return packageJson.materia.cleanName.toLowerCase();
	} catch(e) {
		console.error(e)
		throw "Can't resolve clean name from package.json!"
	}
}

// goes through the master list of default questions and filters according to a given type/types
const getAllQuestions = (type) => {
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
const getQuestion = (ids) => {
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

const resizeImage = (size, double) => {
	let writePath = './src/_icons/icon-' + size;
	if(double) {
		size = size * 2;
		writePath += '@2x';
	}
	writePath += '.png';

	const readBuffer = fs.readFileSync('./src/_icons/icon-394@2x.png');
	return sharp(readBuffer)
		.resize(size, size)
		.toFile(writePath);
}

const INSTALL_TYPE_NUMBER = 'number'
const INSTALL_TYPE_BOOLEAN = 'boolean'
const INSTALL_TYPE_STRING = 'string'
const INSTALL_TYPE_ARRAY = 'object'

const verifyInstallProp = (prop, desiredType = null) => {
	const propType = typeof prop
	if(propType === 'undefined' || propType === 'null') return false
	if (desiredType == null) return true // null is effectively a wildcard for any type of prop
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

// BEGIN PYODIDE CODE

let py = null

// initialize pyodide or, if we did that already, return it
const getPyodide = async () => {
	// we've already initialized pyodide, just pass it back
	if (py) return py

	py = await pyodide.loadPyodide()
	py.setStdout({ batched: msg => console.log(msg) })
	// mount our local python folder with Pyodide so the files are available
	py.mountNodeFS("/python", path.resolve(__dirname, '_python'))
	// also mount the qset directory we can access our qset and play log JSON files in Python
	py.mountNodeFS("/qsets", path.resolve(__dirname, 'qsets'))
	// mount the widget's score module as well
	py.mountNodeFS("/score_module", path.join(process.cwd(), 'src', '_score'))

	let pyResult = py.runPython(`
import sys
import importlib

# Remove possibly cached modules
for name in list(sys.modules):
    if name.startswith("core") or name.startswith("scoring"):
        del sys.modules[name]
importlib.invalidate_caches()

# make sure our mounted file system is available
sys.path.append("/python")
	`)

	// despite datetime and zoneinfo being standard modules,
	// zoneinfo relies on timezone data which pyodide does not
	// have because it's not running in anything remotely close
	// to a normal context
	// if we install the tzdata library we can sidestep it
	await py.loadPackage("micropip")
	await py.runPythonAsync(`
import micropip
await micropip.install("tzdata")
	`)

	return py
}

// END PYODIDE CODE

// ============= ASSETS and SETUP =======================
const app = express();
const port = process.env.PORT || 8118;
// ============= ASSETS and SETUP =======================

hbs.registerPartials(__dirname + 'views/partials', function(err) {});
hbs.localsAsTemplateData(app);

app.set('views', path.join(__dirname , 'views/')); // set the views directory
app.set('layouts', path.join(__dirname , 'views/layouts')); // set the layouts directory
// app.set('view engine', 'html') // set file extension to html
// app.engine('html', require('hbs').__express);
app.set('view engine', 'hbs') // set file extension to hbs

app.use(webpackMiddleware);
// Serve static files from the assets folder
app.use(express.static(path.join(outputPath, 'assets')));

// the web pack middlewere takes time to show up
app.use([/^\/$/, '/mwdk/*', '/api/*'], (req, res, next) => { waitForWebpack(app, next) })

// allow express to parse a JSON post body that ends up in req.body.data
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({extended: true})); // for parsing application/x-www-form-urlencoded

// Enable CORS
app.use(cors({
	origin: '*',
	allowedHeaders: ['Origin, X-Requested-With, Content-Type, Accept']
}));

// MWDK static assets
app.use('/favicon.ico', express.static(path.join(__dirname, 'assets', 'img', 'favicon.ico')))
app.use('/mwdk/assets/', express.static(path.join(__dirname, 'assets')))
app.use('/mwdk/mwdk-assets/js', express.static(path.join(__dirname, 'build')))
app.use('/static/img/materia-logo-thin.svg', express.static(path.join(__dirname, 'assets', 'img', 'materia-logo-thin.svg')))

// Assets from Materia widget dependencies
let clientAssetsPath = require('materia-widget-dependencies/path')
const creator = require('postcss-preset-env');
const e = require('express');
app.use('/materia-assets/css', express.static(path.join(clientAssetsPath, 'css')))
app.use('/materia-assets/js', express.static(path.join(clientAssetsPath, 'js')))
app.use('/js', express.static(path.join(clientAssetsPath, 'js')))

// insert the port into the res.locals
app.use( (req, res, next) => {
	res.locals.port = port
	next()
})

// ============= ROUTES =============

// Display index page
app.get('/', (req, res) => {
	res.locals = Object.assign(res.locals, {template: 'index', title: getWidgetTitle()})
	res.render(res.locals.template)
});

// ============= MWDK ROUTES =============

app.get('/mwdk/my-widgets', (req, res) => {
	res.redirect('/')
});

app.get('/mwdk/icons', (req, res) => {
	const sizes = [
		{size: 394, x2: 394*2, canGenerateLarge: false, canGenerateSmall: true},
		{size: 275, x2: 275*2, canGenerateLarge: true, canGenerateSmall: true},
		{size: 92, x2: 92*2, canGenerateLarge: true, canGenerateSmall: true},
		{size: 60, x2: 60*2, canGenerateLarge: true, canGenerateSmall: true}
	];
	res.locals = Object.assign(res.locals, { template: 'icons', sizes: sizes, timestamp: new Date().getTime()})
	res.render(res.locals.template)
});

app.get('/mwdk/auto-icon/:size/:double?', (req, res) => {
	let regularSizes = [60, 92, 275, 394]
	let doubleSizes = [60, 92, 275]

	if(req.params.size !== 'all') {
		const size = parseInt(req.params.size, 10)
		const isDouble = Boolean(req.params.double)

		// double sized or not?
		regularSizes = isDouble ? [] : [size]
		doubleSizes = isDouble ? [size] : []
	}

	const resizePromises = [
		...regularSizes.map(size => resizeImage(size, false)),
		...doubleSizes.map(size => resizeImage(size, true))
	]

	Promise.all(resizePromises)
	.then(() => {
		res.redirect('/mwdk/icons')
	});
});

// Match any MEDIA URLS that get build into our demo.jsons
// worth noting the <MEDIA=dfdf> is converted to __dfdf__
// this redirects the request directly to the file served by webpack
app.get(/\/mwdk\/media\/__(.+)__/, (req, res) => {
	console.log(`mocking media asset from demo.json :<MEDIA='${req.params[0]}'>`)
	res.redirect(`http://localhost:${res.locals.port}/${req.params[0]}`)
})

app.get('/media/import', (req, res) => {
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

app.post('/mwdk/upload_score_data', (req, res) => {
	const jsonObject = JSON.parse(req.body.value);
	res.set({'Content-Type': 'application/json'})
	let msg = ''
	let error = false
	fs.writeFile(qsets + '/sample_score_data.json', JSON.stringify(jsonObject), (error) => {
		if(error) {
			console.log(error);
			error = true
			res.status(204)
			msg = 'error uploading sample_score_data.json'
		} else {
			res.status(200);
			msg = 'uploaded sample_score_data.json'
			console.log("uploaded sample score data to qsets/sample_score_data.json")
			hasSampleScoreData = true
		}
	});
	return res.json({ error: error, msg: msg})
})

app.post('/mwdk/remove_score_data', async (req, res) => {
	res.set({'Content-Type': 'application/json'})
	let msg = ''
	let error = false
	try {
		await fs.promises.unlink(path.join(qsets, "sample_score_data.json"), (err) => {
			if (err) {
				res.status(204)
				msg = "sample_score_data.json not found"
			} else {
				res.status(200);
				msg = "removed sample_score_data.json"
			}
		});
	} catch(err) {
		msg = "sample_score_data.json not found"
		error = true
		res.status(204)
	}
	hasSampleScoreData = false;
	return res.json({ error: error, msg: msg})
})

app.post('/mwdk/remove_play_logs', async (req, res) => {
	res.set({'Content-Type': 'application/json'})

	let msg = ''
	let error = false
	try {
		await fs.promises.unlink(path.join(qsets, "log.json"), (err) => {
			if (err) {
				res.status(204)
				msg = "log.json not found"
			} else {
				res.status(200);
				msg = "removed log.json"
			}
		});
	} catch(err) {
		msg = "log.json not found"
		error = true
		res.status(204)
	}
	return res.json({ error: error, msg: msg})
})

// Preview widget scores
// we're kind of hacking around this by sending the instance ID as both values
// TODO: revisit storing play data JSON so we can track multiple plays per widget instance
app.get([
	'/mwdk/scores/preview/:id?',
	'/mwdk/scores/preview/:instance?/:play?'
], (req, res) => {
	renderScoreScreen(req, res, true)
})
// Play widget scores
app.get([
	'/mwdk/scores/:instance?/:play?',
	'/mwdk/scores/embed/:instance?/:play?'
	// '/mwdk/scores/:id?'
], (req, res) => {
	renderScoreScreen(req, res, false)
})

const renderScoreScreen = (req, res, isPreview) => {
	res.locals = Object.assign(res.locals, { template: 'score_mwdk', IS_PREVIEW: isPreview ? 'true' : 'false'})
	res.render(res.locals.template)
}

// The create page frame that loads the widget creator
app.get([
	'/mwdk/widgets/1-mwdk/create/'
], (req, res) => {
	res.locals = Object.assign(res.locals, {template: 'creator_mwdk'})
	res.render(res.locals.template, { layout: false})
});
app.get([
	'/mwdk/widgets/1-mwdk/create/:instance',
], (req, res) => {
	let instId = req.params.instance
	if ( instId == '0') {
		instId = generateAlphanumericID()
		res.redirect(`/mwdk/widgets/1-mwdk/embed/create/${instId}`)
	} else {
		res.locals = Object.assign(res.locals, {template: 'creator_mwdk', instance: instId })
		res.render(res.locals.template, { layout: false})
	}
});

app.get('/mwdk/widgets/1-mwdk/creators-guide', (req, res) => {
	res.locals = Object.assign(res.locals, {
		template: 'guide_page',
		name: '1-mwdk',
		type: 'creator',
		hasPlayerGuide: true,
		hasCreatorGuide: true,
		docPath: '/guides/creator.html',
		instance: req.params.hash || 'demo'
	})
	res.render(res.locals.template, { layout: false})
})

app.get('/mwdk/widgets/1-mwdk/players-guide', (req, res) => {
	res.locals = Object.assign(res.locals, {
		template: 'guide_page',
		name: '1-mwdk',
		type: 'player',
		hasPlayerGuide: true,
		hasCreatorGuide: true,
		docPath: '/guides/player.html',
		instance: req.params.hash || 'demo'
	})
	res.render(res.locals.template, { layout: false})
})

// old url
// redirect to home page since we can't set hash here
app.get('/mwdk/widgets/1-mwdk/:instance?', (req, res) => {
	res.redirect('/')
})

function generateAlphanumericID(longer=false) {
	const allowedCharacters = []
	let str = ""
	let i
	// digits
	for(i = 48; i <= 57; i++) {
		allowedCharacters.push(String.fromCharCode(i))
	}
	// uppercase
	for(i = 65; i <= 90; i++) {
		allowedCharacters.push(String.fromCharCode(i))
	}
	// lowercase
	for(i = 97; i <= 122; i++) {
		allowedCharacters.push(String.fromCharCode(i))
	}
	// for (let i = 0; i < 5; i++) {
	// 	let c = Math.floor(Math.random() * (("Z").charCodeAt(0) - ("A").charCodeAt(0) + 1) + ("A").charCodeAt(0));
	// 	str += String.fromCharCode(c);
	// }
	// instance ids are 10-character alphanumeric strings using any digit or letter in upper or lower case
	const targetLength = longer ? 15 : 10
	for (i = 0; i <= targetLength; i++) {
		str += allowedCharacters[Math.floor(Math.random() * allowedCharacters.length)]
	}
	return str
}

function processStatus(actionObj) {
	if (actionObj.status === 'pass') return 'pass'
	if (actionObj.status === 'unknown') return 'unknown'
	else return 'fail'
}

function processAction(actionObj, name) {
	switch (actionObj.status) {
		case 'unknown': {
			return 'Unknown'
		}
		case 'pass': {
			if (actionObj.msg) return `All good - ${actionObj.msg}`
			return 'All good'
		}
		case 'syntax_error': {
			console.error(`Preflight check for ${name} failed: Syntax error`)
			return 'Syntax error'
		}
		case 'file_error': {
			console.error(`Preflight check for ${name} failed: Failed to open file\n- Is the file name correct?\n- Is the file corrupted?`)
			return 'Failed to open file; could be missing or corrupted'
		}
		case 'custom_fail': {
			console.error(`Preflight check for ${name} failed: ${actionObj.msg}`)
			return actionObj.msg
		}
		case 'missing_files': {
			let result = `Missing file '${actionObj.missing[0]}'`
			if (actionObj.missing.length > 1) {
				result += ` and ${actionObj.missing.length - 1} more`
			}
			let log = `Preflight check for ${name} failed: Missing files:\n`
			actionObj.missing.forEach((file) => {
				if (typeof log === 'string')
					log += ` - ${file}\n`
				else
					log += ` - ${file[0]} (${file[1]}\n`
			})
			console.error(log)
			return result
		}
		case 'missing_properties': {
			let result = ''
			if (typeof actionObj.missing[0] === 'object') {
				result = `Missing property '${actionObj.missing[0][0]}' (${actionObj.missing[0][1]})`
			} else {
				result = `Missing property '${actionObj.missing[0]}`
			}
			if (actionObj.missing.length > 1) {
				result += ` and ${actionObj.missing.length - 1} more`
			}
			let log = `Preflight check for ${name} failed: Missing properties:\n`
			actionObj.missing.forEach((prop) => {
				if (typeof log === 'string')
					log += ` - ${prop}\n`
				else
					log += ` - ${prop[0]} (${prop[1]}\n`
			})
			console.error(log)
			return result
		}
		case 'deprecated_values': {
			let result = ''
			if (typeof actionObj.missing[0] === 'object') {
				result = `Deprecated property '${actionObj.missing[0][0]}' (${actionObj.missing[0][1]})`
			} else {
				result = `Deprecated property '${actionObj.missing[0]}`
			}
			if (actionObj.missing.length > 1) {
				result += ` and ${actionObj.missing.length - 1} more`
			}
			let log = `Preflight check for ${name} failed: Deprecated values:\n`
			actionObj.missing.forEach((prop) => {
				if (typeof log === 'string')
					log += ` - ${prop}\n`
				else
					log += ` - ${prop[0]} (${prop[1]}\n`
			})
			log += '\nThese values are no longer required by Materia and should be removed from the install.yaml file.\n'
			console.warn(log)
			return result
		}
		default: {
			return 'Unknown'
		}
	}
}

// Show the package options
app.get('/mwdk/package', (req, res) => {
	// Perform preflight checks
	let action = {
		demo: { state: 'unknown', missing: [] },
		install: { state: 'unknown', missing: [] },
		screenshot: { state: 'unknown', missing: [] },
		icon: { state: 'unknown', missing: [] },
		player: { state: 'unknown', missing: [] },
		creator: { state: 'unknown', missing: [] },
		scoreScreen: { state: 'unknown', missing: [] },
		scoreModule: { state: 'unknown', missing: [] },
	}
	let allGood = true

	//check demo.json
	action.demo.status = 'pass'
	try {
		const demo = JSON.parse(getFileFromWebpack('demo.json').toString())

		// Check for existence of a question structure
		const questions = findQuestions(demo.qset?.data, true)
		if (questions.length === 0) {
			action.demo.status = 'custom_fail'
			action.demo.msg = 'Does not contain any valid question structures'
		}

		if (!demo.name) {
			action.demo.status = 'missing_properties'
			action.demo.missing.push('name')
		}
		if (!demo.qset) {
			action.demo.status = 'missing_properties'
			action.demo.missing.push('qset')
		}
		if (!demo.qset?.version) {
			action.demo.status = 'missing_properties'
			action.demo.missing.push('qset.version')
		}
		if (!demo.qset?.data) {
			action.demo.status = 'missing_properties'
			action.demo.missing.push('qset.data')
		}
	} catch (error) {
		if (error instanceof SyntaxError) {
			action.demo.status = 'syntax_error'
		} else {
			action.demo.status = 'file_error'
		}
	}

	// check install.yaml
	// scope this so we can use it for other checks later
	let install = null
	action.install.status = 'pass'
	try {
		install = yaml.parse(getInstall().toString())
		if (!install.general) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['general', 'object'])
		}
		if (!verifyInstallProp(install.general?.name, INSTALL_TYPE_STRING)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['general.name', 'string'])
		}
		if (verifyInstallProp(install.general?.group)) {
			action.install.status = 'deprecated_values'
			action.install.missing.push(['general.group', 'string'])
		}
		if (!verifyInstallProp(install.general?.height, INSTALL_TYPE_NUMBER)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['general.height', 'number'])
		}
		if (!verifyInstallProp(install.general?.width, INSTALL_TYPE_NUMBER)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['general.width', 'number'])
		}
		if (!verifyInstallProp(install.general?.in_catalog, INSTALL_TYPE_BOOLEAN)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['general.in_catalog', 'boolean'])
		}
		if (!verifyInstallProp(install.general?.is_editable, INSTALL_TYPE_BOOLEAN)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['general.is_editable', 'boolean'])
		}
		if (!verifyInstallProp(install.general?.is_playable, INSTALL_TYPE_BOOLEAN)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['general.is_playable', 'boolean'])
		}
		if (!verifyInstallProp(install.general?.is_qset_encrypted, INSTALL_TYPE_BOOLEAN)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['general.is_qset_encrypted', 'boolean'])
		}
		if (!verifyInstallProp(install.general?.api_version, INSTALL_TYPE_NUMBER)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['general.api_version', 'number'])
		}
		if (!install.files) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['files', 'object'])
		}
		if (!verifyInstallProp(install.files?.creator, INSTALL_TYPE_STRING)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['files.creator', 'string'])
		}
		if (!verifyInstallProp(install.files?.player, INSTALL_TYPE_STRING)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['files.player', 'string'])
		}
		if (!verifyInstallProp(install.files?.flash_version, INSTALL_TYPE_NUMBER)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['files.flash_version', 'number'])
		}
		if (!install.score) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['score', 'object'])
		}
		if (!verifyInstallProp(install.score?.is_scorable, INSTALL_TYPE_BOOLEAN)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['score.is_scorable', 'boolean'])
		}
		if (!verifyInstallProp(install.score?.score_module, INSTALL_TYPE_STRING)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['score.score_module', 'string'])
		}
		if (install.score?.score_screen && !verifyInstallProp(install.score?.score_screen, INSTALL_TYPE_STRING)) {
			//custom score screens are optional
			action.install.status = 'missing_properties'
			action.install.missing.push(['score.score_screen', 'string'])
		}
		if (!install.meta_data) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['meta_data', 'object'])
		}
		if (!verifyInstallProp(install.meta_data?.features, INSTALL_TYPE_ARRAY)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['meta_data.features', 'array'])
		}
		if (!verifyInstallProp(install.meta_data?.supported_data, INSTALL_TYPE_ARRAY)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['meta_data.supported_data', 'array'])
		}
		if (!verifyInstallProp(install.meta_data?.about, INSTALL_TYPE_STRING)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['meta_data.about', 'string'])
		}
		if (!verifyInstallProp(install.meta_data?.excerpt, INSTALL_TYPE_STRING)) {
			action.install.status = 'missing_properties'
			action.install.missing.push(['meta_data.excerpt', 'string'])
		}
	} catch (error) {
		if (error instanceof SyntaxError) {
			action.install.status = 'syntax_error'
		} else  {
			action.install.status = 'file_error'
		}
	}

	// check screenshots
	action.screenshot.status = 'pass'
	for (let i = 1; i <= 3; i++) {
		try {
			if (!getFileFromWebpack(path.join('img', 'screen-shots', `${i}.png`))) throw new Error()
		} catch (error) {
			action.screenshot.status = 'missing_files'
			action.screenshot.missing.push(`src/_screen-shots/${i}.png`)
		}
		try {
			if (!getFileFromWebpack(path.join('img', 'screen-shots', `${i}-thumb.png`))) throw new Error()
		} catch (error) {
			action.screenshot.status= 'missing_files'
			action.screenshot.missing.push(`src/_screen-shots/${i}-thumb.png`)
		}
	}

	// check icons
	const iconSizes = [60, 92, 275, 394]
	action.icon.status = 'pass'
	iconSizes.forEach(size => {
		try {
			if (!getFileFromWebpack(path.join('img', `icon-${size}.png`))) throw new Error()
		} catch (error) {
			action.icon.status = 'missing_files'
			action.icon.missing.push(`src/_icons/icon-${size}.png`)
		}
		try {
			if (!getFileFromWebpack(path.join('img', `icon-${size}@2x.png`))) throw new Error()
		} catch (error) {
			action.icon.status = 'missing_files'
			action.icon.missing.push(`src/_icons/icon-${size}@2x.png`)
		}
	})

	// check creator
	const creatorPath = install?.files?.creator
	if (creatorPath && creatorPath !== 'default') {
		try {
			if (!getFileFromWebpack(creatorPath)) throw new Error()
			action.creator.status = 'pass'
		} catch (error) {
			action.creator.status = 'missing_files'
			action.creator.missing.push(creatorPath)
		}
	} else if (creatorPath === 'default') {
		action.creator.status = 'pass'
		action.creator.msg = 'Using default creator'
	} else {
		action.creator.status = 'custom_fail'
		action.creator.msg = 'Not specified in install.yaml'
	}

	// check player exists
	const playerPath = install?.files?.player
	if (playerPath) {
		try {
			if (!getFileFromWebpack(playerPath)) throw new Error()
			action.player.status = 'pass'
		} catch (error) {
			action.player.status = 'missing_files'
			action.player.missing.push(playerPath)
		}
	} else {
		action.player.status = 'custom_fail'
		action.player.msg = 'Not specified in install.yaml'
	}

	//check score screen exists
	const scoreScreenPath = install?.score?.score_screen
	if (scoreScreenPath != undefined && scoreScreenPath !== 'default') {
		try {
			if (!getFileFromWebpack(scoreScreenPath)) throw new Error()
			action.scoreScreen.status = 'pass'
		} catch (error) {
			action.scoreScreen.status = 'missing_files'
			action.scoreScreen.missing.push(scoreScreenPath)
		}
	} else if (scoreScreenPath === 'default') {
		action.scoreScreen.status = 'pass'
		action.scoreScreen.msg = 'Using default score screen'
	} else {
		// Score screen property not specified - check to see if a custom score screen file might be present
		if (!!getFileFromWebpack('scoreScreen.html', true)) {
			// A score screen file is present but not specified in the install.yaml
			action.scoreScreen.status = 'custom_fail'
			action.scoreScreen.msg = 'Custom scoreScreen.html found, but not set in install.yaml'
		} else {
			action.scoreScreen.status = 'pass'
			action.scoreScreen.msg = 'Using default score screen'
		}
	}

	//check score module
	if (install?.score?.score_module) {
		const scoreModulePath = path.join('_score-modules', 'score_module.py')
		try {
			if(getFileFromWebpack(path.join('_score-modules', 'score_module.py')))
				action.scoreModule.status = 'pass'
			else {
				if(getFileFromWebpack(path.join('_score-modules', 'score_module.php'))) {
					action.scoreModule.status = 'custom_fail'
					action.scoreModule.msg = '.php module found, but no .py'
				} else {
					action.scoreModule.status = 'missing_files'
					action.scoreModule.missing.push(scoreModulePath)			
				}
			}
		} catch(error) {
			action.scoreModule.status = 'missing_files'
			action.scoreModule.missing.push(scoreModulePath)
		}
	} else {
		action.scoreModule.status = 'custom_fail'
		action.scoreModule.msg = 'Not specified in install.yaml'
	}

	const checklist = [
		{
			status: processStatus(action.demo),
			text: 'demo.json',
			action: processAction(action.demo, 'demo.json'),
		},
		{
			status: processStatus(action.install),
			text: 'install.yaml',
			action: processAction(action.install, 'install.yaml'),
		},
		{
			status: processStatus(action.screenshot),
			text: 'Screenshots',
			action: processAction(action.screenshot, 'Screenshots'),
		},
		{
			status: processStatus(action.icon),
			text: 'Icons',
			action: processAction(action.icon, 'Icons'),
		},
		{
			status: processStatus(action.creator),
			text: 'Creator',
			action: processAction(action.creator, 'Creator source code'),
		},
		{
			status: processStatus(action.player),
			text: 'Player',
			action: processAction(action.player, 'Player source code'),
		},
		{
			status: processStatus(action.scoreScreen),
			text: 'Score screen',
			action: processAction(action.scoreScreen, 'Score screen source code'),
		},
		{
			status: processStatus(action.scoreModule),
			text: 'Score module',
			action: processAction(action.scoreModule, 'Score module'),
		},
	]

	// do one more pass over the whole checklist - if there are any failures, prevent build/install
	checklist.forEach(item => {
		if (item.status == 'fail') allGood = false
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


app.get('/mwdk/helper/annotations', (req, res) => {
	res.locals = Object.assign(res.locals, {template: 'helper-annotator', title: 'annotate yo widget'})
	res.render(res.locals.template)
});

app.get('/mwdk/install', (req, res) => {
	res.write('<html><body id="result"><pre>');
	// GREP GUIDE FOR BOTH IMAGE VARS
	// Find the docker-compose container for materia-django-python
	// 1. lists all containers
	// 2. filter for materia python image, named "materia-django-python-x"
	// 3. pick the first line
	// 4. pick the container name

	// attempt to install on both versions of materia if they are found
	let pyImage = execSync('docker ps -a --format "{{.Image}} {{.Names}}" | grep -e "materia-django[-_]python[-_]*" | head -n 1 | cut -d" " -f2');
	let phpImage = execSync('docker ps -a --format "{{.Image}} {{.Names}}" | grep -e ".*materia:.* docker[-_]app[-_].*" | head -n 1 | cut -d" " -f2');
	if(pyImage.length == 0 && phpImage.length == 0){
		console.log(`Couldn't find docker container`)
		res.write(`<h3>Could not find any Materia Docker containers.</h3>`)
		res.write(`<p>Make sure you have either PhP or Django Materia running, then try again.</p>`)
		res.write('<br><a onclick="window.parent.MWDK.Package.cancel();"><button>Close</button></a></body></html>');
		res.end()
		throw "MWDK Couldn't find a docker container."
	}

	// stores what versions/paths of materia we are installing
	// so that we do not have a mess of repeated installation instructions
	// {version: "php" || "django", materiaPath: string, serverWidgetPath: string, dest: string}[]
	const installs = []

	// Build!
	// NOTE: moved build statement here as we dont want to 
	// build the widget again for each version of Materia.
	// moving the statement here only wastes time on a build if
	// containers are improperly configured, which is unlikely
	console.log('Building widget')
	res.write(`> Building widget<br/>`);
	let { widgetPath, widgetData } = buildWidget()

	// create a file name with a timestamp in it
	console.log(`Creating ${widgetData.clean_name}-${new Date().getTime()}.wigt`)
	const filename = `${widgetData.clean_name}-${new Date().getTime()}.wigt`;

	// get the widget I just built
	let widgetPacket = fs.readFileSync(widgetPath)
	
	try {
		if(pyImage.length > 0){
			pyImage = pyImage.toString().trim();
			console.log(`Installing widget to Django Materia on image '${pyImage}'.`)
			res.write(`> Installing widget to Django Materia on image '${pyImage}'.<br/>`)

			// get the image information
			let containerInfo = execSync(`docker inspect ${pyImage}`);
			containerInfo = JSON.parse(containerInfo.toString());

			// Find mounted volume that will tell us where materia is on the host system
			let foundMateria = containerInfo[0].Mounts.filter(m => m.Destination === '/var/www/html')
			if(!foundMateria){
				console.error('[DJANGO] MWDK Couldnt find the Materia mount on the host system')
				res.write(`</pre><h1>Cant Find Materia Django</h1>`);
				throw `[DJANGO] MWDK Couldn't find the Materia mount on the host system'`
			}

			// find mounted volume for the local widget storage
			let foundWidgets = containerInfo[0].Mounts.filter(m => m.Destination === '/var/www/html/staticfiles/widget')
			if(!foundWidgets){
				console.error('[DJANGO] MWDK Couldnt find the Materia Widget storage mount on the host system')
				res.write(`</pre><h1>Cant Find Materia Django Widgets</h1>`);
				throw `[DJANGO] MWDK Couldnt find the Materia Widget storage mount on the host system'`
			}

			// depending on your Docker version, host_mnt may be prepended to the directory path
			let materiaPath = foundMateria[0].Source.replace(/^\/host_mnt/, '') 
			let serverWidgetPath = foundWidgets[0].Source.replace(/^\/host_mnt/, '')

			// make sure the dir exists
			console.log(`[DJANGO] Checking if ${serverWidgetPath} exists`)
			if(!fs.existsSync(serverWidgetPath)){
				console.log(`[DJANGO] Making directory ${serverWidgetPath}`)
				fs.mkdirSync(serverWidgetPath);
			}

			installs.push({
				version: "django", 
				materiaPath: materiaPath, 
				serverWidgetPath: serverWidgetPath,
				dest: path.join(foundWidgets[0].Destination, filename)
			})
		} 
	} catch(err) {
		console.error('[DJANGO] MWDK Install Failed')
		res.write(`</pre><h1>Materia Django Install Failed</h1>`);
	}

	try {
		if(phpImage.length > 0){
			phpImage = phpImage.toString().trim();
			console.log(`Installing widget to PhP Materia on image '${phpImage}'.`)
			res.write(`> Installing widget to PhP Materia on image '${phpImage}'.<br/>`)

			// get the image information
			let containerInfo = execSync(`docker inspect ${phpImage}`);
			containerInfo = JSON.parse(containerInfo.toString());

			// Find mounted volume that will tell us where materia is on the host system
			let found = containerInfo[0].Mounts.filter(m => m.Destination === '/var/www/html')
			if(!found){
				console.error('[PHP] MWDK Couldnt find the Materia mount on the host system')
				res.write(`</pre><h1>Cant Find Materia PhP</h1>`);
				throw `[PHP] MWDK Couldn't find the Materia mount on the host system'`
			}
			let materiaPath = found[0].Source.replace(/^\/host_mnt/, '') // depending on your Docker version, host_mnt may be prepended to the directory path
			let serverWidgetPath = `${materiaPath}/fuel/app/tmp/widget_packages`

			// make sure the dir exists
			console.log(`[PHP] Checking if ${materiaPath}/fuel/app/tmp/widget_packages exists`)
			if(!fs.existsSync(serverWidgetPath)){
				console.log(`[PHP] Making directory ${materiaPath}/fuel/app/tmp/widget_packages`)
				fs.mkdirSync(serverWidgetPath);
			}

			installs.push({
				version: "php", 
				materiaPath: materiaPath, 
				serverWidgetPath: serverWidgetPath,
				dest: ""
			})
		}
	} catch {
		console.error('[PHP] MWDK Install Failed')
		res.write(`</pre><h1>Materia PhP Install Failed</h1>`);
	}

	if(installs.length == 0) {
		console.error('MWDK No installs were successful')
		res.write(`</pre><h1>No installs were successful</h1>`);
		res.write('<br><a onclick="window.parent.MWDK.Package.cancel();"><button>Close</button></a></body></html>');
		res.end()
		throw `MWDK No installs were successful`
	}

	// try installing on each of our prepared versions
	installs.forEach((install, i)=>{
		// write the built widget to that path
		let target = path.join(install.serverWidgetPath, filename)
		console.log(`> Writing to ${target}<br/>`)
		res.write(`> Writing to ${target}<br/>`);
		fs.writeFileSync(target, widgetPacket);

		// attempt install for given version
		try {
			let run;
			
			// run the install command
			if(install.version == "django") {
				console.log(`[DJANGO] Running > make install-widget-file file="${install.dest}"`)
				res.write(`[DJANGO] Running > make install-widget-file file="${install.dest}"`);
				run = require('child_process').spawn(`make`, [`install-widget-file`, `file="${install.dest}"`], {cwd: `${install.materiaPath}/..`})
			} else {
				console.log(`[PHP] Running > cd ${install.materiaPath}/docker/ && ./run_widgets_install.sh ${filename}`)
				res.write(`[PHP] Running > cd ${install.materiaPath}/docker/ && ./run_widgets_install.sh ${filename}`);
				run = require('child_process').spawn(`./run_widgets_install.sh`, [`${install.filename}`], {cwd: `${install.materiaPath}/docker/`})
			}

			run.stdout.on('data', function(data) {
				console.log('stdout: ' + data.toString());
				res.write(data.toString());
			})
			run.stderr.on('data', function(data) {
				console.error('stderr: ' + data.toString());
				res.write(data.toString());
			})
			run.on('close', function(code) {
				if (code == 0) {
					res.write(`<h2>[${install.version.toUpperCase()}] SUCCESS!<h2/>`);
				} else {
					res.write(`<h2>[${install.version.toUpperCase()}] Something failed!<h2/>`);
				}
				res.write('<h3>child process exited with code ' + code.toString() + '</h3>');
				console.log(`ps process exited with code ${code}`);
				
				// only exit response if this is the last install performed
				if(i+1 == installs.length) {
					res.write('<br><a onclick="window.parent.MWDK.Package.cancel();"><button>Close</button></a></body></html>');
					res.end()
				}
			})			
		}
		catch (err) {
			throw err;
			res.write("<h2>Something failed!<h2/>");

			res.write('<a onclick="window.parent.MWDK.Package.cancel();"><button>Close</button></a></body></html>');
			res.end()
		}
	})

	
	
});

// ============= MATERIA-SPECIFIC ROUTES =============

// route to list the saved qsets
app.use(['/qsets/import', '/mwdk/saved_qsets'], (req, res) => {
	const saved_qsets = {};

	const files = fs.readdirSync(qsets);
	for (let i in files) {
		const file = files[i]

		if (!file.includes('instance')){
			continue;
		}

		const actual_path = path.join(qsets, file);
		const qset_data = JSON.parse(fs.readFileSync(actual_path).toString());
		saved_qsets[qset_data.id] = qset_data.name;
	}

	res.json(saved_qsets);
});

// redirect to the player page
app.get('/mwdk/player/:instance?', (req, res) => {
	if (!req.params.instance) {
		res.redirect('/mwdk/player/demo')
	}
	else res.redirect('/preview/' + (req.params.instance ? req.params.instance : ''))
})

app.get([
	'/preview/:id?',
	'/preview-embed/:id?',
	'/play/:id?',
	'/embed/:id?',
], (req, res) => {
	let widget = yaml.parse(getInstall().toString())
	const instanceId = req.params.id || 'demo'
	res.locals = Object.assign(res.locals, {
		template: 'player_mwdk',
		instance: instanceId,
		// stupid hack - overload the playId value to contain both the instance
		//  and play IDs separated by a double dash
		// this sucks, if there's any way of elegantly passing both of these
		//  values through the entire play/score process then definitely do that
		playId: instanceId + '--' + generateAlphanumericID(true),
		widgetWidth: widget.general.width,
		widgetHeight: widget.general.height
	})
	res.render(res.locals.template, { layout: false})
});

// Question importer for creator
app.get(['/questions/import', '/mwdk/questions/import/'], (req, res) => {
	res.locals = Object.assign(res.locals, {template: 'question_importer'})
	res.render(res.locals.template)
});

// A default preview blocked template if a widget's creator doesnt have one
// @TODO im not sure this is used?
app.get('/preview_blocked/:instance?', (req, res) => {
	res.locals = Object.assign(res.locals, {template: 'preview_blocked', instance: req.params.instance || 'demo'})
	res.render(res.locals.template)
});

// ============= MOCK API ROUTES =======================

const findQuestion = (q, id) => {
	if (id == null) return null

	if (q.options && q.options.id) {
		if (q.options.id == id) {
			return q
		}
	} else if (q.id == id) {
		return q
	}

	// recursively look through array to find a question object
	if (Array.isArray(q)) {
		for (let qItem of q) {
			let result = findQuestion(qItem, id)
			if (result) {
				return result
			}
		}
	}
	return null
}

app.use('/api/session/verify/', (req, res) => {
	res.json([{
		isAuthenticated: true,
		permLevel: 'basic_author'
	}])
})

app.get('/api/widgets/', (req, res) => {
	let widgetData = createApiWidgetData();

	return res.json([widgetData])
})

app.get('/api/widgets/:widget/publish_perms_verify/', (req, res) => {
	return res.json({
		publishPermsValid: true
	})
})

app.post('/api/instances/', (req, res) => {
	const data = req.body

	// sweep through the qset items and make sure there aren't any nonstandard question properties
	// TODO: probably need to audit this list
	const standard_props = [
		'materiaType',
		'id',
		'type',
		'created_at',
		'questions',
		'answers',
		'options',
		'assets',
		'name',
		'items' //some widgets double-nest 'items'
	];

	const nonstandard_props = [];

	for (let index in data.qset.data.items) {
		const item = data.qset.data.items[index];

		for (let prop in item) {
			if (!Array.from(standard_props).includes(prop)) {
				nonstandard_props.push(`"${prop}"`);
				console.log(`Nonstandard property found in qset: ${prop}`);
			}
		}
	}

	const id = generateAlphanumericID()
	// add IDs to questions and answers that might be missing them
	const qset = JSON.stringify(performQSetSubsitutions(JSON.stringify(data.qset)));
	fs.writeFileSync(path.join(qsets, id + '.json'), qset);

	const instance = createApiWidgetInstanceData(id)
	instance.id = id
	instance.name = data.name

	instance.qset = JSON.parse(qset)

	fs.writeFileSync(path.join(qsets, id + '.instance.json'), JSON.stringify(instance));

	// send a warning back to the creator if any nonstandard question properties were detected
	if (nonstandard_props.length > 0) {
		const plurals = nonstandard_props.length > 1 ? ['properties', 'were'] : ['property', 'was'];
		console.log ('Warning: Nonstandard qset item ' +
			plurals[0] + ' ' + nonstandard_props.join(', ') + ' ' +
			plurals[1]);
	}

	res.json(instance);
})

app.patch('/api/instances/:instance/', (req, res) => {
	const id = req.params.instance
	const data = req.body
	// add IDs to questions and answers that might be missing them
	const qset = JSON.stringify(performQSetSubsitutions(JSON.stringify(data.qset)));
	fs.writeFileSync(path.join(qsets, id + '.json'), qset);
	
	const instance = createApiWidgetInstanceData(id)
	instance.id = id
	instance.name = data.name

	instance.qset = JSON.parse(qset)
	
	res.json(instance)
})

app.get('/api/instances/:instance/lock/', (req, res) => {
	res.json({ lock_obtained: true })
})

app.get('/api/instances/:instance/question_sets/', (req, res) => {
	res.set('Content-Type', 'application/json')
	// load instance, fallback to demo
	try {
		const id = req.params.instance
		let qset = fs.readFileSync(path.join(qsets, id+'.json')).toString()
		qset = performQSetSubsitutions(qset, false)
		findAndStandardizeQuestions(qset)
		qset = JSON.stringify(qset)
		res.send(qset.toString());
	} catch (e) {
		res.json(getDemoQset(false).qset);
	}
})

app.get('/api/instances/:instance/', (req, res) => {
	const instId = req.params.instance

	let instance = JSON.parse(fs.readFileSync(path.join(qsets, instId+'.instance.json')))

	res.json(instance)
})

app.put('/api/play-sessions/:playId/', (req, res) => {
	const logs = req.body
	try {
		console.log("========== Play Logs Received ==========\r\n", logs, "\r\n============END PLAY LOGS================")
		const logFilePath = path.join(qsets, `${req.params.playId}-log.json`)

		if (!fs.existsSync(logFilePath)) {
			fs.writeFileSync(logFilePath, JSON.stringify(logs))
		} else {
			// we'll need to read the existing logs and append this new one(s) to the end
			const existingLogs = JSON.parse(fs.readFileSync(logFilePath))
			existingLogs.logs = [...existingLogs.logs, ...logs.logs]
			fs.writeFileSync(logFilePath, JSON.stringify(existingLogs))
		}

		// surely there's a better way of carrying instance ID through to this point
		// but for now, it's baked into the play ID - format is instanceId--playId
		// so we can split on the '--' pattern to extract both from the single value
		const instanceId = req.params.playId.split('--')[0]

		res.json({
			success: true,
			score_url: `/mwdk/scores/embed/${instanceId}/${req.params.playId}`
		})
	} catch(err) {
		console.log(err)
		res.json({success: false});
	}
})

// TODO: is this used?
app.get('/api/play-sessions/:instance/', (req, res) => {
	console.log('getting play data')
})
// TODO: add something here to optionally use uploaded play data JSON
app.get('/api/scores/details/', async (req, res) => {
	res.set('Content-Type', 'application/json')

	let id = 'demo';
	id = req.query.play_id

	if (id == null) {
		return res.json([])
	}
	let instId, playId
	if (id !== 'demo') {
		[instId, playId] = id.split('--')
	}

	// only bother with pyodide if we have a python score module for the widget we're developing
	let scoreModule = getFileFromWebpack(path.join('_score-modules', 'score_module.py'))
	if (!!scoreModule) {
		install = yaml.parse(getInstall().toString())
		const p = await getPyodide()
		await p.runPythonAsync(`
import json
import logging
from core.models import LogPlay, WidgetInstance, Widget
from scoring.module_factory import ScoreModuleFactory

logger = logging.getLogger(__name__)

try:
	inst = WidgetInstance("${instId}")
	play = LogPlay("${playId}", inst)
	sm = ScoreModuleFactory.create_score_module(instance=inst,play=play)
	score_report = sm.get_score_report()
	# this would ordinarily be handled mostly automatically by a serializer
	score_report["qset"] = sm.qset
	# easier here to just attach these values manually
	score_report["qset"]["id"] = 0
	score_report["qset"]["instance"] = "${instId}"
	score_report["qset"]["created_at"] = score_report["overview"]["created_at"]
	output_val = json.dumps(score_report, default=str)
except Exception :
	logger.error('L', exc_info=True)`)
		const output = p.globals.get('output_val')
		res.json(JSON.parse(output))
	} else {
		res.json({})
	}
	return
})
app.get('/api/scores/details', (req, res) => {
	console.log('generic scores api endpoint')
})

app.listen(port, function () {
	console.log(`Listening on port ${port}`);
})
