const path         = require('path');
const fs           = require('fs')
const express      = require('express')
const qsets        = path.join(__dirname, 'qsets');
const bodyParser   = require('body-parser');
const yaml         = require('yamljs');
const { execSync } = require('child_process');

var webPackMiddleware = false;

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

// Loads local dev materia files
var getFile = (file) => {
	try {
		// @TODO load from memory instead of the disk?
		return fs.readFileSync(path.join(__dirname, 'views', file))
	} catch (e) {
		return console.log(`error trying to load ${file}`);
	}
};


var getFileFromWebpack = (file) => {
	try {
		// pull the specified filename out of memory
		return webPackMiddleware.fileSystem.readFileSync(path.resolve(__dirname, '..', '..', 'build', file));
	} catch (e) {
		console.error(e)
		throw `error trying to load ${file} from widget src, reload if you just started the server`
	}
}

// Replaces strings in a template
var templateSwap = (file, target, replace) => {
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
var makeWidgetInstance = (id) => {
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
		widget = makeWidget(id);
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
var makeWidget = function(id) {
	const widget = yaml.parse(getFileFromWebpack('install.yaml').toString());

	widget.player = widget.files.player;
	widget.creator = widget.files.creator;
	widget.clean_name = widget.general.name.replace(new RegExp(' ', 'g'), '-').toLowerCase();
	widget.dir = widget.clean_name + '/';
	widget.width = widget.general.width;
	widget.height = widget.general.height;
	return widget;
};

var getWidgetDemo = () => {
	let json = getFileFromWebpack('demo.json').toString()
	return JSON.stringify(JSON.parse(json).qset);
}

// goes through the master list of default questions and filters according to a given type/types
var getAllQuestions = function(type) {
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
var getQuestion = function(ids) {
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

module.exports = (app) => {

	// ============= ASSETS and SETUP =======================

	// allow express to parse a JSON post body that ends up in req.body.data
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({extended: true}));

	// serve the static files from devmateria
	app.use('/mdk/assets', express.static(path.join(__dirname, 'assets')))
	app.use('/mdk/assets/js', express.static(path.join(__dirname, 'build')))


	// the web pack middlewere takes time to show up
	app.use((req, res, next) => {
		if(getWebPackMiddleWare(req.app)){
			return next();
		}
		else
		{
			res.write(getFile('wait.html'));
			return res.end();
		}
	})

	// ============= ROUTES =======================

	// Display index page
	app.get('/', (req, res) => {
		const file = getFile('index.html');
		res.write(templateSwap(file, 'title', getWidgetTitle()));
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
		const file = getFile('player_container.html');
		res.write(templateSwap(file, 'instance', instance));
		return res.end();
	});

	// The create page frame that loads the widget creator
	app.get('/creator/:instance?', function(req, res) {
		const instance = req.params.instance || null;

		let file = getFile('creator_container.html');
		file = templateSwap(file, 'instance', instance);

		// @TODO port 8080 is hard-coded here, see if we
		// can get it from webpack or something?
		res.write(templateSwap(file, 'port', '8080'));
		return res.end();
	});

	// API endpoint for getting the widget instance data
	app.use('/widget_instances_get', (req, res) => {
		const id = JSON.parse(req.body.data)[0][0];
		const instance = makeWidgetInstance(id);

		return res.send(JSON.stringify(instance));
	});

	app.post('/widgets_get', function(req, res) {
		const id = JSON.parse(req.body.data)[0][0];
		const widget = makeWidget(id);

		return res.send(JSON.stringify([widget]));
	});

	app.post('/question_set_get', function(req, res) {
		const id = JSON.parse(req.body.data)[0];

		// load instance, fallback to demo
		try {
			return res.send(fs.readFileSync(path.join(qsets, id+'.json')).toString());
		} catch (e) {
			return res.send(getWidgetDemo());
		}
	});

	app.post('/session_valid', (req, res) => res.end());

	app.post('/play_logs_save', function(req, res) {
		const logs = JSON.parse(req.body.data)[1];
		console.log(logs);

		return res.end("{ \"score\": 0 }");
	});

	// Show the package options
	app.get('/package', function(req, res) {
		res.write(getFile('download_package.html'));
		return res.end();
	});

	// Build and download the widget file
	app.get('/download', function(req, res) {
		try{
			let output = execSync('yarn run build -- -p')
			console.log(output.toString())
		} catch(e) {
			console.error(e)
			return res.send("There was an error building the widget")
		}

		let widget = makeWidget();
		let pathToFile = path.resolve(__dirname, '..', '..', 'build', '_output', `${widget.clean_name}.wigt`)
		res.set('Content-Disposition', `attachment; filename=${widget.clean_name}.wigt`);
		return res.send(fs.readFileSync(pathToFile));
	});


	// api mock for saving widget instances
	// creates files in our qset directory (probably should use a better thing)
	app.post('/widget_instance_save', function(req, res) {
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

		const instance = makeWidgetInstance(data[0])[0];
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
	app.get('/questions/import/', function(req, res) {
		const file = getFile('question_importer.html');

		// @TODO port 8080 is hard-coded here, see if we
		// can get it from webpack or something?
		res.write(templateSwap(file, 'port', '8080'));
		return res.end();
	});

	// API mock for getting questions for the question importer
	app.post('/questions_get/', function(req, res) {
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
	app.get('/preview_blocked/:instance?', function(req, res) {
		const instance = req.params.instance || 'demo';

		const file = getFile('preview_blocked.html');

		res.write(templateSwap(file, 'instance', instance));
		return res.end();
	});

	app.get('/install', (req, res) => {
		// determine the directory that Materia's files are running from
		const targetImage = execSync('docker ps --filter "name=phpfpm" --format "{{.Names}}"');

		let dockerInfo = execSync(`docker inspect ${targetImage.toString()}`);
		dockerInfo = JSON.parse(dockerInfo.toString());

		let materiaPath = false;

		for (let k in dockerInfo[0].Mounts) {
			const mount = dockerInfo[0].Mounts[k];
			if (mount.Destination === '/var/www/html') {
				materiaPath = mount.Source;
				break;
			}
		}

		const productionConfig = require(path.resolve('webpack.package.config.js'))(req.query);

		const productionCompiler = webpack(productionConfig);
		const productionMiddleware = webpackMiddleware(productionCompiler, {
			publicPath: productionConfig.output.publicPath,
			contentBase: 'build',
			stats: buildOutput
		});

		return productionMiddleware.waitUntilValid(() => {
			const widget = makeWidget();

			execSync(`find ${materiaPath}/fuel/app/tmp/widget_packages -name '${widget.clean_name}*.wigt' -delete`);

			const file = productionMiddleware.fileSystem.readFileSync(path.join(productionConfig.output.path, '_output', widget.clean_name + '.wigt'));
			const time = new Date().getTime();
			const filename = widget.clean_name+'-'+time+'.wigt';

			fs.writeFileSync(path.join(materiaPath, '/fuel/app/tmp/widget_packages', filename), file);

			const installCommand = `cd ${materiaPath}` +
				" && cd .. " +
				" && ./install_widget.sh " + filename;

			let installResult = execSync(installCommand);
			installResult = installResult.toString();

			console.log(installResult);

			const match = installResult.match(/Widget installed\:\ ([A-Za-z0-9\-]+)/);

			if ((match != null) && match[1]) {
				const redirectUrl = `http://127.0.0.1/widgets/${match[1]}`;
				return res.redirect(redirectUrl);
			}
		});
	});

}
