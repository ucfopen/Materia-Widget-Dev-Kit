const fs = require('fs')
const path = require('path')
const webpack = require('webpack')
const autoprefixer = require('autoprefixer');
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const ZipPlugin = require('zip-webpack-plugin')
const GenerateWidgetHash = require('./webpack-generate-widget-hash')
const nodeExternals = require("webpack-node-externals");
const postcssPresetEnv = require('postcss-preset-env');
const { addAbortSignal } = require('stream');
const AddAssetHtmlPlugin = require('add-asset-html-webpack-plugin');
const MateriaDevServer = require('./express');

// creators and players may reference materia core files directly
// To do so rather than hard-coding the actual location of those files
// the build process will replace those references with the current relative paths to those files
//const packagedJSPath = 'src=\\"../../../js/$3\\"'
const packagedJSPath = 'src=\"/mwdk/mwdk-assets/$3\"'
const devServerJSPath = 'src=\\"/mwdk/assets/js/$3\\"'
const isRunningDevServer = process.argv.find((v) => {return v.includes('webpack-dev-server')} )
const replaceTarget = isRunningDevServer ? devServerJSPath : packagedJSPath

// common paths used here
const srcPath = path.join(process.cwd(), 'src') + path.sep
const outputPath = path.join(process.cwd(), 'build') + path.sep

// list of supported browsers for use in autoprefixer
const browserList = [
	'Explorer >= 11',
	'last 3 Chrome versions',
	'last 3 ChromeAndroid versions',
	'last 3 Android versions',
	'last 3 Firefox versions',
	'last 3 FirefoxAndroid versions',
	'last 3 iOS versions',
	'last 3 Safari versions',
	'last 3 Edge versions'
]

// when copying files, always ignore these
const copyIgnore = [
	'.gitkeep'
]

// regex rules needed for replacing scripts loaded from materia
const materiaJSReplacements = [
	{ search: /src=(\\?("|')?)(materia.enginecore.js)(\\?("|')?)/g,  replace: replaceTarget },
	{ search: /src=(\\?("|')?)(materia.scorecore.js)(\\?("|')?)/g,   replace: replaceTarget },
	{ search: /src=(\\?("|')?)(materia.creatorcore.js)(\\?("|')?)/g, replace: replaceTarget },
	{ search: /src=(\\?("|')?)(materia.scorecore.js)(\\?("|')?)/g,   replace: replaceTarget },
];

// webpack entries
const getDefaultEntries = () => ({
	'creator.js': [
		`${srcPath}creator.coffee`
	],
	'player.js': [
		`${srcPath}player.coffee`
	],
	'creator.css': [
		`${srcPath}creator.html`,
		`${srcPath}creator.scss`
	],
	'player.css': [
		`${srcPath}player.html`,
		`${srcPath}player.scss`
	]
})

// Load the materia configuration settings from the package.json file
const configFromPackage = () => {
	let packagePath  = path.join(process.cwd(), 'package.json')
	let packageJson  = require(packagePath)
	return {
		cleanName : packageJson.materia.cleanName.toLowerCase(),
	}
}

// Provides a default config option
const combineConfig = (extras = {}) => {
	const rules = getDefaultRules()
	const orderedRules = [
		rules.loaderDoNothingToJs,
		rules.loaderCompileCoffee,
		rules.loadAndCompileMarkdown,
		rules.copyImages,
		rules.loadHTMLAndReplaceMateriaScripts,
		// rules.loadAndPrefixCSS,
		rules.loadAndPrefixSASS
	]

	const pkgConfig = configFromPackage()
	const config = {
		cleanName: pkgConfig.cleanName,
		copyList: extras.copyList ? extras.copyList : getDefaultCopyList(),
		entries: extras.entries ? extras.entries : getDefaultEntries(),
		moduleRules: extras.moduleRules ? extras.moduleRules : orderedRules
	}

	return config
}

// list of files and directories to copy into widget
const getDefaultCopyList = () => {
	const copyList = [
		{
			//flatten: true,
			from: `${srcPath}demo.json`,
			to: `${outputPath}demo.json`,
		},
		{
			//flatten: true,
			from: `${srcPath}install.yaml`,
			to: outputPath,
		},
		{
			from: `${srcPath}_icons`,
			to: `${outputPath}img`,
			toType: 'dir'
		},
		{
			//flatten: true,
			from: `${srcPath}_score`,
			to: `${outputPath}_score-modules`,
			toType: 'dir'
		},
		{
			from: `${srcPath}_screen-shots`,
			to: `${outputPath}img/screen-shots`,
			toType: 'dir'
		}
	]

	// assets directory is built in , but optional
	let assetsPath = `${srcPath}assets`
	if (fs.existsSync(assetsPath)) {
		copyList.push({
			from: assetsPath,
			to: `${outputPath}assets`,
			toType: 'dir'
		})
	}

	// optionally use demo_dev.json to replace demo.json
	// when running the dev server
	const devDemo = 'demo_dev.json'
	const devDemoPath = `${srcPath}${devDemo}`
	if (isRunningDevServer && fs.existsSync(devDemoPath)) {
		console.log(`===== USING ${devDemo} ====`)
		copyList.push({
			// flatten: true,
			from: devDemoPath,
			to: `${outputPath}demo.json`,
			force: true
		})
	}

	return copyList
}

// Rules needed for common builds
const getDefaultRules = () => ({
	// process regular javascript files
	// SKIPS the default webpack Javascript functionality
	// that evaluates js code and processes module imports
	loaderDoNothingToJs: {
		test: /\.js$/i,
		exclude: /node_modules/,
		// loader: ExtractTextPlugin.extract({
		// 	use: ['raw-loader']
		// }),
		type: 'asset/source',
		// use: [
		// 	{
		// 		loader: 'raw-loader',
		// 		options: {
		// 			esModule: true,
		// 		}
		// 	}
		// ],
		// type: 'javascript/auto'
	},
	// process coffee files by translating them to js
	// SKIPS the default webpack Javascript functionality
	// that evaluates js code and processes module imports
	loaderCompileCoffee: {
		test: /\.coffee$/i,
		exclude: /node_modules/,
		// loader: ExtractTextPlugin.extract({
		// 	use: [
		// 		'raw-loader',
		// 		{
		// 			loader: 'coffee-loader',
		// 			options: {
		// 				transpile:{
		// 					presets: [
		// 						'@babel/preset-env'
		// 					]
		// 				}
		// 			}
		// 		}
		// 	]
		// }),
		type: 'asset/source',
		use: [
			// {
			// 	loader: 'raw-loader',
			// 	options: {
			// 		esModule: true,
			// 	}
			// },
			{
				loader: 'coffee-loader',
				options: {
					transpile:{
						presets: [
							'@babel/preset-env'
						]
					}
				}
			}
		],
		// type: 'javascript/auto'
	},
	// webpack is going to look at all the images, fonts, etc
	// in the src of the html files, this will tell webpack
	// how to deal with those files
	copyImages: {
		test: /\.(jpe?g|png|gif|svg)$/i,
		exclude: /node_modules/,
		// loader: 'file-loader',
		// query: {
		// 	emitFile: false, // keeps this plugin from renaming the file to an md5 hash
		// 	useRelativePath: true, // keeps path of img/src/imag.png intact
		// 	name: '[name].[ext]'
		// },
		// use: [
		// 	{
		// 		loader: 'file-loader',
		// 		options: {
		// 			emitFile: false,
		// 			name: '[name].[ext]'
		// 		}
		// 	}
		// ]
		type: 'asset/resource',
		generator: {
			filename: '[name][ext]'
		}
	},
	// Loads the html files and minifies their contents
	// Rewrites the paths to our materia core libs provided by materia server
	//
	loadHTMLAndReplaceMateriaScripts: {
		test: /\.html$/i,
		exclude: /node_modules|_guides|guides/,
		type: 'asset/source',
		use: [
			// {
			// 	loader: 'file-loader',
			// 	options: { name: '[name].html' }
			// },
			// {
			// 	loader: 'extract-loader'
			// },
			{
				loader: 'string-replace-loader',
				options: { multiple: materiaJSReplacements }
			},
			//'html-loader'
		]
	},
	// Process SASS/SCSS/CSS Files
	// Adds autoprefixer
	loadAndPrefixSASS: {
		test: /\.s(a|c)ss|css$/i,
		exclude: /node_modules\/(?!(materia-widget-development-kit\/templates)\/).*/,
		use: [
			{
				loader: MiniCssExtractPlugin.loader
			},
			{
				loader: "css-loader",
				options: {
					url: false,
					esModule: false
				},
			},
			{
				// postcss-loader is needed to run autoprefixer
				loader: 'postcss-loader',
				options: {
					postcssOptions: {
						// add autoprefixer, tell it what to prefix
						plugins: [
							require('autoprefixer')({
								overrideBrowserslist: browserList
							})
						],
					}
				},
			},
			"sass-loader",
		],
	},
	loadAndCompileMarkdown: {
		test: /\.md$/,
		exclude: /node_modules/,
		// type: 'asset/source',
		generator: {
			name: '[name].html',
			outputPath: 'guides/'
		},
		use: [
			{
				loader: 'html-loader',
				options: {
					sources: false,
				}
			},
			'markdown-loader'
		]
	}
})

// This is a base config for building legacy widgets
// It will skip webpack's javascript functionality
// to avoid having to make changes to the source code of those widgets
// the config argument allows you to override some settings
// you can update the return from this method to modify or alter
// the base configuration
const getLegacyWidgetBuildConfig = (config = {}) => {
	// load and combine the config
	let cfg = combineConfig(config)

	let maphash = new Map();

	// This is here to account for the current entry scheme in widgets, until it gets replaced
	for (const [key, value] of Object.entries(cfg.entries))
	{
		let name = key;
		let split = key.split('.');
		if (split.length > 1)
		{
			name = split[0];
			// Sorting out css files (which are now handled by MiniCssExtractPlugin)
			if (split[1].localeCompare("css") == 0)
			{
				continue;
			}
		}
		if (!maphash.has(name))
		{
			// Default extension is html
			let ext = "html";
			let splitUpName = value[0].split('.');
			if (splitUpName[splitUpName.length - 1] == "md")
			{
				console.log(value)
				let hashSplit = splitUpName[0].split('/');
				let type = '';
				if (hashSplit.length > 1) type = hashSplit[hashSplit.length - 1];
				else type = hashSplit[0];
				ext = "md"
			}
			maphash.set(name, new HtmlWebpackPlugin({
				filename: `${name}.html`,
				template: `${value[0].split('.')[0]}.${ext}`, // Include source path in template
				inject: false,
				minify: false,
				chunks: [`${name}`]
			}));
			// maphash.set(name, new HtmlWebpackPlugin({
			// 	filename: `${name}.html`,
			// 	template: `src/${name}.html`,
			// 	inject: false,
			// 	minify: false,
			// 	chunks: [`${name}`]
			// }));
		}
	}

	let htmlWebpackPlugins = Array.from(maphash.values());
	console.log(htmlWebpackPlugins)

	let build = {
		mode: 'development',
		stats: {children: false},
		devServer: {
			// contentBase: outputPath,
			headers: {
				// allow iframes to talk to their parent containers
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
			},
			historyApiFallback: true,
			port: process.env.PORT || 8118,
			// static:
			// devMiddleware: {
			// 	publicPath: './express2',
			// 	serverSideRender: true,
			// 	writeToDisk: true,
			// },
			// stats: {children: false},
		},

		// These are the default js and css files
		entry: cfg.entries,

		// write files to the outputPath (default = ./build) using the object keys from 'entry' above
		output: {
			path: outputPath,
			filename: '[name].js',
			publicPath: '',
			clean: true
		},
		// externals: [nodeExternals()],

		module: {rules: cfg.moduleRules},
		plugins: [
			// clear the build directory
			// new CleanWebpackPlugin(),
			// copy all the common resources to the build directory
			new CopyPlugin({
				patterns: cfg.copyList,
			},
			// {ignore: copyIgnore}
			),
			// new webpack.ProvidePlugin({
			// 	angular: 'angular',
			// }),
			...htmlWebpackPlugins,
			// extract css from the webpack output
			new MiniCssExtractPlugin({
				filename: '[name].css'
			}),
			// zip everything in the build path to zip dir
			new ZipPlugin({
				path: `${outputPath}_output`,
				filename: cfg.cleanName,
				extension: 'wigt'
			}),
			new GenerateWidgetHash({
				widget: `_output/${cfg.cleanName}.wigt`,
				output: `_output/${cfg.cleanName}-build-info.yml`
			})
		]
	}


	// conditionally add plugins to handle guides if the directory exists in /src
	// if (fs.existsSync(`${srcPath}_guides/creator.md`))
	// {
	// 	const buffer = fs.readFileSync(path.join(outputPath, 'guides', `creator-partial.html`), 'utf8');

	// 	const body = buffer.toString()

	// 	build.plugins.unshift(new HtmlWebpackPlugin({
	// 		template: 'node_modules/materia-widget-development-kit/templates/guide-template',
	// 		templateContent: body,
	// 		filename: `guides/creator.html`,
	// 		htmlTitle: `Widget Creator Guide`,
	// 		inject: false,
	// 	}));
	// 	// build.plugins.unshift(new CopyPlugin({
	// 	// 	patterns: [
	// 	// 		{
	// 	// 			from: path.join(__dirname, 'templates', 'guideStyles.scss'),
	// 	// 			to: path.join('./', `${srcPath}`)
	// 	// 		}
	// 	// 	]
	// 	// }))
	// }
	// // if (fs.existsSync(`${srcPath}_guides`))
	// // {
	// // 	// attach the guideStyles css to the default entry, if used
	// // 	build.entry['guides/guideStyles.css'] = [
	// // 		'./node_modules/materia-widget-development-kit/templates/guideStyles.scss'
	// // 	]

	// // 	build.plugins.unshift(
	// // 		// explicitly remove the creator.temp.html and player.temp.html files created as part of the markdown conversion process
	// // 		new CleanWebpackPlugin({
	// // 			cleanAfterEveryBuildPatterns: [`${outputPath}guides/creator.temp.html`, `${outputPath}guides/player.temp.html`]
	// // 		})
	// // 	)

	// // 	// inject the compiled guides markdown into the templates and re-emit the guides
	// // if (fs.existsSync(`${srcPath}_guides/creator.md`))
	// // {
	// // 	build.plugins.unshift(
	// // 		new HtmlWebpackPlugin({
	// // 			template: 'node_modules/materia-widget-development-kit/templates/guide-template',
	// // 			filename: 'guides/creator.html',
	// // 			htmlTitle: 'Widget Creator Guide'
	// // 		})
	// // 	)
	// // }
	// if (fs.existsSync(`${srcPath}_guides/player.md`))
	// {
	// 	const buffer = fs.readFileSync(path.join(outputPath, 'guides', `player-partial.html`), 'utf8');

	// 	const body = buffer.toString()

	// 	build.plugins.unshift(
	// 		new HtmlWebpackPlugin({
	// 			template: 'node_modules/materia-widget-development-kit/templates/guide-template',
	// 			templateContent: body,
	// 			filename: `guides/player.html`,
	// 			htmlTitle: `Widget Player Guide`,
	// 			inject: false,
	// 		})
	// 	)
	// }
	// else {
	// 	console.warn("No helper docs found, skipping plugins")
	// }

	return build
}

module.exports = {
	materiaJSReplacements: materiaJSReplacements,
	configFromPackage: configFromPackage,
	getLegacyWidgetBuildConfig: getLegacyWidgetBuildConfig,
	getDefaultRules: getDefaultRules,
	getDefaultCopyList: getDefaultCopyList,
	getDefaultEntries: getDefaultEntries
}
