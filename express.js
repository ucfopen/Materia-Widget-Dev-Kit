const path         = require('path');
const fs           = require('fs')
const express      = require('express')
const qsets        = path.join(__dirname, 'qsets');
const bodyParser   = require('body-parser');
const yaml         = require('yamljs');
const { execSync } = require('child_process');
const waitUntil    = require('wait-until-promise').default

var webPackMiddleware = false;
var hasCompiled = false;

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

// Loads local MDK view files from the disk
var getView = (file) => {
	try {
		// @TODO load from memory instead of the disk?
		return fs.readFileSync(path.join(__dirname, 'views', file))
	} catch (e) {
		return console.log(`error trying to load ${file}`);
	}
};

// Loads processed widget files from webpack's memory
var getFileFromWebpack = (file) => {
	try {
		// pull the specified filename out of memory
		return webPackMiddleware.fileSystem.readFileSync(path.resolve(__dirname, '..', '..', 'build', file));
	} catch (e) {
		console.error(e)
		throw `error trying to load ${file} from widget src, reload if you just started the server`
	}
}

var replaceStringInTemplate = (file, target, replace) => {
	const str = file.toString();
	let re = new RegExp(`{{${target}}}`, 'g');
	// if replacing 'target' with null, take extra steps to ensure it is actually 'null' and not the string '"null"'
	if (replace === null) {
		re = new RegExp(`('|"){{${target}}}('|")`, 'g');
	}

	return Buffer.from(str.replace(re, replace));
};

// Widget creation/management support functions
var getWidgetTitle = () => {
	const install = getFileFromWebpack('install.yaml');
	return yaml.parse(install.toString()).general.name;
};

// create a widget instance data structure
var createApiWidgetInstanceData = (id) => {
	let e;
	let qset = null;
	let widget = null;
	const widgetPath = null;

	// attempt to load a previously saved instance with the given ID
	try {
		return JSON.parse(fs.readFileSync(path.join(qsets, id+'.instance.json')).toString());
	} catch (error) { e = error; }

	// generate a new instance with the given ID
	try {
		qset = JSON.parse(getFileFromWebpack('demo.json').toString());
		widget = createApiWidgetData(id);
	} catch (e) {
		console.log('Error in makeInstance from the widget.coffee file:');
		console.log(e);
	}

	return [{
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
	}];
};

// Build a mock widget data structure
var createApiWidgetData = (id) => {
	let widget = yaml.parse(getFileFromWebpack('install.yaml').toString());

	widget.player = widget.files.player;
	widget.creator = widget.files.creator;
	widget.clean_name = widget.general.name.replace(new RegExp(' ', 'g'), '-').toLowerCase();
	widget.dir = widget.clean_name + '/';
	widget.width = widget.general.width;
	widget.height = widget.general.height;
	return widget;
};

// run yarn build in production mode to build the widget
var buildWidget = () => {
	try{
		console.log('Building production ready widget')
		let output = execSync('yarn run build -- -p')
	} catch(e) {
		console.error(e)
		console.log(output.toString())
		return res.send("There was an error building the widget")
	}

	let widgetData = createApiWidgetData();
	let widgetPath = path.resolve(__dirname, '..', '..', 'build', '_output', `${widgetData.clean_name}.wigt`)

	return {
		widgetPath: widgetPath,
		widgetData: widgetData
	}
}

// Read the widget demo from memory
var getWidgetDemo = () => {
	let json = getFileFromWebpack('demo.json').toString()
	return JSON.stringify(JSON.parse(json).qset);
}

// goes through the master list of default questions and filters according to a given type/types
var getAllQuestions = (type) => {
	type = type.replace('Multiple%20Choice', 'MC');
	type = type.replace('Question%2FAnswer', 'QA');
	const types = type.split(',');

	const qlist = [];

	const obj = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'mdk_questions.json')).toString());
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

	const obj = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'mdk_questions.json')).toString());
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

// app is passed a reference to the webpack dev server (Express.js)
module.exports = (app) => {

	// ============= ASSETS and SETUP =======================

	// the web pack middlewere takes time to show up
	// this will pause all requests till we're able to
	// 1. talk to the middlware
	// 2. load the widget's install.yaml from webpack's in-memory files
	app.all('*', (req, res, next) => {

		// stop checking once it's worked
		if(hasCompiled){
			return next();
		}

		waitUntil(() => {
			// check for the middleware first
			if(!getWebPackMiddleWare(req.app)) return false;

			// then check to see if we can find install.yaml
			try {
				getFileFromWebpack('install.yaml')
				return true
			} catch(e) {
				console.log("waiting for install.yaml to be handled by webpack")
				return false
			}
		}, 8000)
		.then(() => {
			hasCompiled = true
			return next();
		})
		.catch((error) => {
			throw "MDK couldn't locate the widget's install.yaml.  Make sure you have one and webpack is processing it."
		})

	})

	// allow express to parse a JSON post body that ends up in req.body.data
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({extended: true}));

	// serve the static files from devmateria
	app.use('/mdk/assets', express.static(path.join(__dirname, 'assets')))
	app.use('/mdk/assets/js', express.static(path.join(__dirname, 'build')))


	// ============= ROUTES =======================

	// Display index page
	app.get('/', (req, res) => {
		const file = getView('index.html');
		res.write(replaceStringInTemplate(file, 'title', getWidgetTitle()));
		return res.end();
	});

	// re-route all image requests to lorempixel
	app.get('/media/:id', (req, res) => res.redirect(`http://lorempixel.com/800/600/?c=${req.params.id}`));

	// route to list the saved qsets
	app.use('/saved_qsets', (req, res) => {
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

		res.write(JSON.stringify(saved_qsets));
		return res.end();
	});

	// The play page frame that loads the widget player in an iframe
	app.get('/player/:instance?', (req, res) => {
		const instance = req.params.instance || 'demo';
		const file = getView('player_container.html');
		res.write(replaceStringInTemplate(file, 'instance', instance));
		return res.end();
	});

	// The create page frame that loads the widget creator
	app.get('/creator/:instance?', (req, res) => {
		const instance = req.params.instance || null;

		let file = getView('creator_container.html');
		file = replaceStringInTemplate(file, 'instance', instance);

		// @TODO port 8080 is hard-coded here, see if we
		// can get it from webpack or something?
		res.write(replaceStringInTemplate(file, 'port', '8080'));
		return res.end();
	});

	// API endpoint for getting the widget instance data
	app.use('/widget_instances_get', (req, res) => {
		const id = JSON.parse(req.body.data)[0][0];
		const instance = createApiWidgetInstanceData(id);

		return res.send(JSON.stringify(instance));
	});

	app.post('/widgets_get', (req, res) => {
		const id = JSON.parse(req.body.data)[0][0];
		const widget = createApiWidgetData(id);

		return res.send(JSON.stringify([widget]));
	});

	app.post('/question_set_get', (req, res) => {
		const id = JSON.parse(req.body.data)[0];

		// load instance, fallback to demo
		try {
			return res.send(fs.readFileSync(path.join(qsets, id+'.json')).toString());
		} catch (e) {
			return res.send(getWidgetDemo());
		}
	});

	app.post('/session_valid', (req, res) => res.end());

	app.post('/play_logs_save', (req, res) => {
		const logs = JSON.parse(req.body.data)[1];
		console.log(logs);

		return res.end("{ \"score\": 0 }");
	});

	// Show the package options
	app.get('/package', (req, res) => {
		res.write(getView('download_package.html'));
		return res.end();
	});

	// Build and download the widget file
	app.get('/download', (req, res) => {
		let { widgetPath, widgetData } = buildWidget()

		res.set('Content-Disposition', `attachment; filename=${widgetData.clean_name}.wigt`);
		return res.send(fs.readFileSync(widgetPath));
	});


	// api mock for saving widget instances
	// creates files in our qset directory (probably should use a better thing)
	app.post('/widget_instance_save', (req, res) => {
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
		];

		const nonstandard_props = [];

		for (let index in data[2].data.items) {
			const item = data[2].data.items[index];
			for (let prop in item) {

				if (!Array.from(standard_props).includes(prop)) {
					nonstandard_props.push(`"${prop}"`);
					delete data[2].data.items[index][prop];
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
			instance.warning = 'Warning: Nonstandard qset item ' +
				plurals[0] + ' ' + nonstandard_props.join(', ') + ' ' +
				plurals[1] + ' not saved. Use options instead.';
		}

		return res.end(JSON.stringify(instance));
	});

	// Question importer for creator
	app.get('/questions/import/', (req, res) => {
		const file = getView('question_importer.html');

		// @TODO port 8080 is hard-coded here, see if we
		// can get it from webpack or something?
		res.write(replaceStringInTemplate(file, 'port', '8080'));
		return res.end();
	});

	// API mock for getting questions for the question importer
	app.post('/questions_get/', (req, res) => {
		const given = JSON.parse(req.body.data);

		// we selected specific questions
		if (given[0]) {
			return res.end(JSON.stringify(getQuestion(given[0])));
		// we just want all of them from the given type
		} else {
			return res.end(JSON.stringify(getAllQuestions(given[1])));
		}
	});

	// A default preview blocked template if a widget's creator doesnt have one
	// @TODO im not sure this is used?
	app.get('/preview_blocked/:instance?', (req, res) => {
		const instance = req.params.instance || 'demo';

		const file = getView('preview_blocked.html');

		res.write(replaceStringInTemplate(file, 'instance', instance));
		return res.end();
	});

	app.get('/install', (req, res) => {

		// Find the docker-compose container for materia-web
		// 1. lists all containers
		// 2. filter for materia-web image and named xxxx_phpfpm_1 name
		// 3. pick the first line
		// 4. pick the container name
		let targetImage = execSync('docker ps -a --format "{{.Image}} {{.Names}}" | grep -e ".*materia-web:.* .*phpfpm_\\d" | head -n 1 | cut -d" " -f2');
		if(!targetImage){
			throw "MDK Couldn't find a docker container using a 'materia-web' image named 'phpfpm'."
		}
		targetImage = targetImage.toString().trim();
		console.log(`Using Docker image '${targetImage}' to install widgets`)

		// get the image information
		let containerInfo = execSync(`docker inspect ${targetImage}`);
		containerInfo = JSON.parse(containerInfo.toString());

		// Find mounted volume that will tell us where materia is on the host system
		let found = containerInfo[0].Mounts.filter(m => m.Destination === '/var/www/html')
		if(!found){
			throw `MDK Couldn't find the Materia mount on the host system'`
		}
		let materiaPath = found[0].Source;
		let serverWidgetPath = `${materiaPath}/fuel/app/tmp/widget_packages`

		// Build!
		let { widgetPath, widgetData } = buildWidget()

		// Clear any existing wigt
		execSync(`find ${serverWidgetPath} -name '${widgetData.clean_name}*.wigt' -delete`);

		// create a file name with a timestamp in it
		const filename = `${widgetData.clean_name}-${new Date().getTime()}.wigt`;

		// get the widget I just built
		let widgetPackate = fs.readFileSync(widgetPath)

		// write the built widget to that path
		fs.writeFileSync(path.join(serverWidgetPath, filename), widgetPackate);

		// run the install command
		let installResult = execSync(`cd ${materiaPath}/../ && ./run_widgets_install.sh ${filename}`);
		installResult = installResult.toString();

		console.log(installResult);

		// search for success in the output
		const match = installResult.match(/Widget installed\:\ ([A-Za-z0-9\-]+)/);

		if(match && match[1]) {
			return res.redirect(`http://127.0.0.1/widgets/${match[1]}`);
		}

		throw `It looks like install failed?`
	});
}
