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

// common paths used here
const outputPath           = path.join(process.cwd(), 'build') + path.sep

// Webpack middleware setup
const webpack              = require('webpack');
const webpackDevMiddleware = require('webpack-dev-middleware');
const config               = require(path.resolve(process.cwd(), './webpack.config.cjs'));
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
const waitForWebpack = (app, next) => {
	if(hasCompiled) return next(); // short circuit if ready

	waitUntil(() => {
		try {
			getInstall()
			// clean up
			fs.readdir(qsets, async (err, files) => {
				if (err) throw err;
				for (const file of files) {
					if (file == '.gitkeep') continue
					console.log("removing file: " + file)
					await fs.promises.unlink(path.join(qsets, file), (err) => {
						if (err) throw err;
					});
				}

				console.log("creating demo instance")
				const instance = createApiWidgetInstanceData('demo', true)[0];
				instance.name = instance.name
				instance.id = 'demo'

				if (process.env.TEST_MWDK) {
					fs.copyFileSync('sample-demo.json', path.join(qsets, 'demo.json'));
				} else {
					fs.writeFileSync(path.join(qsets, 'demo.instance.json'), JSON.stringify([instance]));
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
		if(!quiet) console.error(e)
		throw `error trying to load ${file} from widget src, reload if you just started the server`
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

// create a widget instance data structure
const createApiWidgetInstanceData = (id) => {
	// attempt to load a previously saved instance with the given ID
	try {
		let savedInstance = JSON.parse(fs.readFileSync(path.join(qsets, id+'.instance.json')))[0]
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

		return [savedInstance];
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

	return [{
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
	}];
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
	}
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

// Assets from Materia widget dependencies
let clientAssetsPath = require('materia-widget-dependencies/path')
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
app.get('/mwdk/scores/preview/:id?', (req, res) => {
	res.locals = Object.assign(res.locals, { template: 'score_mwdk', IS_PREVIEW: 'true'})
	res.render(res.locals.template)
})
// Play widget scores
app.get(['/mwdk/scores/:id?'], (req, res) => {
	res.locals = Object.assign(res.locals, { template: 'score_mwdk', IS_PREVIEW: 'false'})
	res.render(res.locals.template)
})

// The create page frame that loads the widget creator
// Must have hash '1' to work
app.get('/mwdk/widgets/1-mwdk/create', (req, res) => {
	res.locals = Object.assign(res.locals, {template: 'creator_mwdk', instance: req.params.hash || generateInstanceID() })
	res.render(res.locals.template, { layout: false})
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

function generateInstanceID() {
	let str = ""
	for (let i = 0; i < 5; i++) {
		let c = Math.floor(Math.random() * (("Z").charCodeAt(0) - ("A").charCodeAt(0) + 1) + ("A").charCodeAt(0));
		str += String.fromCharCode(c);
	}
	return str;
}

// Show the package options
app.get('/mwdk/package', (req, res) => {
	res.locals = Object.assign(res.locals, {template: 'download'})
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
	// Find the docker-compose container for materia-web
	// 1. lists all containers
	// 2. filter for materia-web image and named xxxx_phpfpm_1 name
	// 3. pick the first line
	// 4. pick the container name
	let targetImage = execSync('docker ps -a --format "{{.Image}} {{.Names}}" | grep -e ".*materia:.* docker[-_]app[-_].*" | head -n 1 | cut -d" " -f2');
	if(!targetImage){
		console.log(`Couldn't find docker container`)
		throw "MWDK Couldn't find a docker container."
	}
	targetImage = targetImage.toString().trim();
	console.log(`Using Docker image '${targetImage}' to install widgets`)
	res.write(`> Using Docker image '${targetImage}' to install widgets<br/>`);

	// get the image information
	let containerInfo = execSync(`docker inspect ${targetImage}`);
	containerInfo = JSON.parse(containerInfo.toString());

	// Find mounted volume that will tell us where materia is on the host system
	let found = containerInfo[0].Mounts.filter(m => m.Destination === '/var/www/html')
	if(!found){
		console.error('MWDK Couldnt find the Materia mount on the host system')
		res.write(`</pre><h1>Cant Find Materia</h1>`);
		throw `MWDK Couldn't find the Materia mount on the host system'`
	}
	let materiaPath = found[0].Source.replace(/^\/host_mnt/, '') // depending on your Docker version, host_mnt may be prepended to the directory path
	let serverWidgetPath = `${materiaPath}/fuel/app/tmp/widget_packages`

	// make sure the dir exists
	console.log(`Checking if ${materiaPath}/fuel/app/tmp/widget_packages exists`)
	if(!fs.existsSync(serverWidgetPath)){
		console.log(`Making directory ${materiaPath}/fuel/app/tmp/widget_packages`)
		fs.mkdirSync(serverWidgetPath);
	}

	// Build!
	console.log('Building widget')
	res.write(`> Building widget<br/>`);
	let { widgetPath, widgetData } = buildWidget()

	// create a file name with a timestamp in it
	console.log(`Creating ${widgetData.clean_name}-${new Date().getTime()}.wigt`)
	const filename = `${widgetData.clean_name}-${new Date().getTime()}.wigt`;

	// get the widget I just built
	let widgetPacket = fs.readFileSync(widgetPath)

	// write the built widget to that path
	let target = path.join(serverWidgetPath, filename)
	console.log(`> Writing to ${target}<br/>`)
	res.write(`> Writing to ${target}<br/>`);
	fs.writeFileSync(target, widgetPacket);

	// run the install command
	console.log(`Running > cd ${materiaPath}/docker/ && ./run_widgets_install.sh ${filename}`)
	res.write(`Running > cd ${materiaPath}/docker/ && ./run_widgets_install.sh ${filename}`);

	try {
		let run = require('child_process').spawn(`./run_widgets_install.sh`, [`${filename}`], {cwd: `${materiaPath}/docker/`})

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
				res.write("<h2>SUCCESS!<h2/>");
			} else {
				res.write("<h2>Something failed!<h2/>");
			}
			res.write('child process exited with code ' + code.toString());
			console.log(`ps process exited with code ${code}`);

			res.write('<br><a onclick="window.parent.MWDK.Package.cancel();"><button>Close</button></a></body></html>');
			res.end()
		})
	}
	catch (err) {
		throw err;
		res.write("<h2>Something failed!<h2/>");

		res.write('<a onclick="window.parent.MWDK.Package.cancel();"><button>Close</button></a></body></html>');
		res.end()
	}
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
		const qset_data = JSON.parse(fs.readFileSync(actual_path).toString())[0];
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

app.get(['/preview/:id?'], (req, res) => {
	let widget = yaml.parse(getInstall().toString());
	res.locals = Object.assign(res.locals, { template: 'player_mwdk', instance: req.params.id || 'demo', widgetWidth: widget.general.width, widgetHeight: widget.general.height })
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

// API endpoint for getting the widget instance data
app.use('/api/json/widget_instances_get', (req, res) => {
	const id = JSON.parse(req.body.data)[0];
	res.json(createApiWidgetInstanceData(id, false));
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
		qset = performQSetSubsitutions(qset, false)
		qset = JSON.stringify(qset)
		res.send(qset.toString());
	} catch (e) {
		res.json(getDemoQset(false).qset);
	}
});

app.use(['/api/json/session_play_verify', '/api/json/session_author_verify'] , (req, res) => res.send('true'));

app.use('/api/json/play_logs_save', (req, res) => {
	const logs = JSON.parse(req.body.data)[1];
	try {
		fs.writeFileSync(path.join(qsets, 'log.json'), JSON.stringify(logs));
		console.log("========== Play Logs Received ==========\r\n", logs, "\r\n============END PLAY LOGS================");
		res.json(true);
	} catch(err) {
		console.log(err)
		res.json(false);
	}
});

// api mock for saving widget instances
// creates files in our qset directory (probably should use a better thing)session
app.use(['/api/json/widget_instance_new', '/api/json/widget_instance_update', '/api/json/widget_instance_save'], (req, res) => {
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

	const id = (data[0].match(/([A-Za-z]{5})+/g) ? data[0] : generateInstanceID());
	const qset = JSON.stringify(data[2]);
	fs.writeFileSync(path.join(qsets, id + '.json'), qset);

	const instance = createApiWidgetInstanceData(data[0], true)[0];
	instance.id = id;
	instance.name = data[1];

	instance.qset = JSON.parse(qset)

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

app.use('/api/json/user_get', (req, res) => {
	res.json([{
		id: '1'
	}])
})

app.use('/api/json/notifications_get', (req, res) => {
	res.json([])
})

app.use('/api/json/score_summary_get', (req, res) => {
	let summary = [{
		"id": 69,
		"term": "Fall",
		"year": 2023,
		"students": 1,
		"average": 100,
		"distribution": [
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			2
		],
		"graphData": [
			{
			"label": "0-9",
			"value": 0
			},
			{
			"label": "10-19",
			"value": 0
			},
			{
			"label": "20-29",
			"value": 0
			},
			{
			"label": "30-39",
			"value": 0
			},
			{
			"label": "40-49",
			"value": 0
			},
			{
			"label": "50-59",
			"value": 0
			},
			{
			"label": "60-69",
			"value": 0
			},
			{
			"label": "70-79",
			"value": 0
			},
			{
			"label": "80-89",
			"value": 0
			},
			{
			"label": "90-100",
			"value": 1
			}
		],
		"totalScores": 1
	}]
	res.json(summary)
})

function get_detail_style(score)
{
	style = '';
	switch (score)
	{
		case -1:
		case '-1':
			style = 'ignored-value';
			break;

		case 100:
		case '100':
			style = 'full-value';
			break;

		case '0':
		case 0:
			style = 'no-value';
			break;

		default:
			style = 'partial-value';
			break;
	}
	return style;
}

function get_ss_expected_answers(log, question)
{
	console.log(question)
	switch (question.type)
	{
		case 'MC':
			max_value = 0;
			max_answers = [];

			// find the correct answer(s)
			question.answers.forEach(answer =>
			{
				if (answer.value > max_value)
				{
					max_value = answer.value;
					max_answers.push(answer.text);
				}
			})

			// display all of the correct answers
			if (max_answers.length > 0)
				if (max_answers.length > 1)
					return max_answers.join(" or ")
				return max_answers[0]

		case 'QA':
		default:
			return question.answers[0].text;
	}
}

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

app.use(['/api/json/widget_instance_play_scores_get', '/api/json/guest_widget_instance_scores_get'], (req, res) => {
	const initialValue = 0

	res.set('Content-Type', 'application/json')

	const body = JSON.parse(req.body.data)
	let id = 'demo';
	if (req.originalUrl.substring(req.originalUrl.lastIndexOf('/') + 1) == 'widget_instance_play_scores_get' && body[1] !== null) {
		// preview inst id is not null
		id = body[1]
	} else {
		// use play id
		id = body[0]
	}
	if (id == null) {
		return res.json([])
	}

	// get play logs
	let logs = null
	try {
		logs = fs.readFileSync(path.join(qsets,'log.json')).toString()
		logs = JSON.parse(logs)
	}
	catch (err) {
		console.log("log.json not found")
		// change id to demo to load the demo qset instead
		id = "demo"
	}

	// load instance, fallback to demo
	let questions = []
	try {
		let qset = fs.readFileSync(path.join(qsets, id+'.json'))
		qset = JSON.parse(qset)
		questions = qset.data.items
	} catch (e) {
		demoqset = getDemoQset(false)
		questions = demoqset.qset.data.items
	}

	if (questions[0] && Object.hasOwn(questions[0], 'items')) {
		// legacy qsets
		questions = questions[0].items
	}

	// get sample play scores to model data off of
	// copy everything but data
	// look at data style and fill data in respectively (switch case)
	let sample_score_data = null
	if (hasSampleScoreData) {
		try {
			let scoreDataFile = fs.readFileSync(path.join(qsets, 'sample_score_data.json')).toString()
			sample_score_data = JSON.parse(scoreDataFile)
		} catch (err) {
			console.log(err)
		}
	}

	// if there are no play logs, return sample score data
	if (logs == null) {
		if (sample_score_data != null) {
			return res.json(sample_score_data)
		} else {
			return false;
		}
	}

	let playLogs = logs.filter(log => !log.is_end)

	let totalScore = 0, totalLength = 0;
	let table = playLogs.map((log, index) => {
		let question = findQuestion(questions, log.item_id)
		// let question = questions[index]
		if (question) {
			let answer = null
			// find the answer for the log in the qset
			if (question.answers) answer = question.answers.find(a => log.text == a.text || log.value == a.text)
			// get the feedback
			let feedback = null
			if (answer && answer.options && answer.options.feedback) {
				feedback = answer.options.feedback
			}
			let logScore = -1

			if (sample_score_data != null) {
				data = []
				let samplelogIndex = index
				// if there are more logs than there is sample data, use first sample element
				if (index >= sample_score_data[0].details[0].table.length)
					samplelogIndex = 0
				// store location of response and answer for scoring
				let responseIndex = -1;
				let answerIndex = -1;
				// create the data
				sample_score_data[0].details[0].table[samplelogIndex].data_style.forEach((type, i) => {
					switch (type) {
						case 'question':
							data.push(question.questions[0]['text'])
							break;
						case 'response':
							if (log.text != undefined && log.text != null && log.text.slice(0, 8) != 'mwdk-mock')
								data.push(log.text)
							else if (log.value != undefined && log.value != null  && log.value.slice(0, 8) != 'mwdk-mock')
								data.push(log.value) // some widgets' qsets store response in log.value
							responseIndex = i
							break;
						case 'answer':
							data.push(get_ss_expected_answers(log, question))
							answerIndex = i
							break;
						default:
							data.push(sample_score_data[0].details[0].table[samplelogIndex].data[i])
					}
				})

				// shoe in check_answer
				if (responseIndex >= 0 && answerIndex >=0)
					logScore = data[responseIndex] == data[answerIndex] ? 100 : 0;

				totalScore += logScore;
				totalLength++;

				return {
					'data'			: data,
					'data_style'    : sample_score_data[0].details[0].table[samplelogIndex].data_style,
					'score'         : logScore,
					'feedback'      : feedback,
					'type'          : sample_score_data[0].details[0].table[samplelogIndex].type,
					'style'         : get_detail_style(logScore),
					'tag'           : 'div',
					'symbol'        : '%',
					'graphic'       : 'score',
					'display_score' : sample_score_data[0].details[0].table[samplelogIndex].display_score
				}
			}

			// find which log field is the response
			// is not foolproof or comprehensive
			let responseData = ''
			if (log.text && log.text.slice(0, 9) != 'mwdk-mock')
				responseData = log.text
			else if (log.value && log.value.slice(0, 9) != 'mwdk-mock')
				responseData = log.value // some widgets' qsets store response in log.value

			let answerData = get_ss_expected_answers(log, question)

			logScore = typeof(log.value) == 'number' ? log.value : (responseData == answerData ? 100 : 0);

			totalScore += logScore;
			totalLength++;

			return {
					'data'			: [
						question.questions[0]['text'],
						responseData, // some widgets' qsets store response in log.value
						answerData],
					'data_style'    : ['question', 'response', 'answer'],
					'score'         : logScore,
					'feedback'      : feedback,
					'type'          : log.is_end ? 'SCORE_FINAL_FROM_CLIENT' : 'SCORE_QUESTION_ANSWERED',
					'style'         : get_detail_style(logScore),
					'tag'           : 'div',
					'symbol'        : '%',
					'graphic'       : 'score',
					'display_score' : logScore != -1
			}
		}
	})

	table = table.filter(deet => deet != null)

	let header = [
		"Question Score",
		"The Question",
		"Your Response",
		"Correct Answer"
	]
	let title = ''

	if (sample_score_data != null) {
		header = sample_score_data[0].details[0].header
		title = sample_score_data[0].details[0].title
	}

	let details = [{
		title: title,
		header: header,
		table: table
	}]

	score = totalLength > 0 ? totalScore / totalLength : 0;

	overview_items = [
		{'message': 'Points Lost', 'value': score - 100},
		{'message': 'Final Score', 'value': score}
	];

	let overview = {
		'complete': true,
		'score': score,
		'table': overview_items,
		'referrer_url': '',
		'created_at': '',
		'auth': ''
	}

	let result = [{
		overview,
		details
	}]

	res.json(result)
})

app.listen(port, function () {
	console.log(`Listening on port ${port}`);
})
