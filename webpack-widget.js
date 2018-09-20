const fs                = require('fs')
const path              = require('path')
const webpack           = require('webpack')
const CleanPlugin       = require('clean-webpack-plugin')
const CopyPlugin        = require('copy-webpack-plugin')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const ZipPlugin         = require('zip-webpack-plugin')

const MateriaDevServer = require('./express');

// Default Materia Widget Config
const defaultCfg = {
	cleanName: '',
	srcPath: path.join(process.cwd(), 'src'),
	outputPath: path.join(process.cwd(), 'build'),
	demoPath: 'demo.json',
	installPath: 'install.yaml',
	iconsPath: '_icons',
	scorePath: '_score/',
	screenshotsPath: '_screen-shots/',
	assetsPath: 'assets/',
	preCopy: []
}

// creators and players may reference materia core files directly
// To do so rather than hard-coding the actual location of those files
//the build process will replace those references with the current relative paths to those files

const packagedJSPath = 'src=\\"../../../js/$3\\"'
const devServerJSPath = 'src=\\"/mdk/assets/js/$3\\"'
const isRunningDevServer = process.argv.find((v) => {return v.includes('webpack-dev-server')} )
const replaceTarget = isRunningDevServer ? devServerJSPath : packagedJSPath

const materiaJSReplacements = [
	{ search: /src=(\\?("|')?)(materia.enginecore.js)(\\?("|')?)/g,  replace: replaceTarget },
	{ search: /src=(\\?("|')?)(materia.scorecore.js)(\\?("|')?)/g,   replace: replaceTarget },
	{ search: /src=(\\?("|')?)(materia.creatorcore.js)(\\?("|')?)/g, replace: replaceTarget },
];

// Load the materia configuration settings from the package.json file
const configFromPackage = () => {
	let packagePath  = path.join(process.cwd(), 'package.json')
	let packageJson  = require(packagePath)
	return {
		cleanName : packageJson.materia.cleanName.toLowerCase(),
	}
}

// This is a base config for building legacy widgets
// It will skip webpack's javascript functionality
// to avoid having to make changes to the source code of those widgets
// the config argument allows you to override some settings
// you can update the return from this method to modify or alter
// the base configuration
const getLegacyWidgetBuildConfig = (config = {}) => {
	// load and combine the config
	let materiaConfig = configFromPackage()
	cfg = Object.assign({}, defaultCfg, {cleanName:materiaConfig.cleanName}, config)
	// set up source and destination paths
	let srcPath = cfg.srcPath + path.sep
	let outputPath = cfg.outputPath + path.sep

	//standard list of directories/files we want to copy as-is into build
	let copyList = [
		//tack on any additional files to copy that were specified by the widget
		...cfg.preCopy,
		{
			flatten: true,
			from: `${srcPath}${cfg.demoPath}`,
			to: `${outputPath}/demo.json`,
		},
		{
			flatten: true,
			from: `${srcPath}${cfg.installPath}`,
			to: outputPath,
		},
		{
			from: `${srcPath}${cfg.iconsPath}`,
			to: `${outputPath}img`,
			toType: 'dir'
		},
		{
			flatten: true,
			from: `${srcPath}${cfg.scorePath}`,
			to: `${outputPath}_score-modules`,
			toType: 'dir'
		},
		{
			from: `${srcPath}${cfg.screenshotsPath}`,
			to: `${outputPath}img/screen-shots`,
			toType: 'dir'
		}
	]

	//assets directory is not always used, therefore optional - check for it first
	let assetsPath = `${srcPath}${cfg.assetsPath}`
	if (fs.existsSync(assetsPath)) {
		copyList.push({
			from: assetsPath,
			to: `${outputPath}assets`,
			toType: 'dir'
		})
	}

	const rules = {
		// process regular javascript files
		// SKIPS the default webpack Javascript functionality
		// that evaluates js code and processes module imports
		loaderDoNothingToJs: {
			test: /\.js$/i,
			exclude: /node_modules/,
			loader: ExtractTextPlugin.extract({
				use: ['raw-loader']
			})
		},
		// process coffee files by translating them to js
		// SKIPS the default webpack Javascript functionality
		// that evaluates js code and processes module imports
		loaderCompileCoffee: {
			test: /\.coffee$/i,
			exclude: /node_modules/,
			loader: ExtractTextPlugin.extract({
				use: ['raw-loader', 'coffee-loader']
			})
		},
		// webpack is going to look at all the images, fonts, etc
		// in the src of the html files, this will tell webpack
		// how to deal with those files
		copyImages: {
			test: /\.(jpe?g|png|gif|svg)$/i,
			loader: 'file-loader',
			query: {
				emitFile: false, // keeps this plugin from renaming the file to an md5 hash
				useRelativePath: true, // keeps path of img/src/imag.png intact
				name: '[name].[ext]'
			}
		},
		// Loads the html files and minifies their contents
		// Rewrites the paths to our materia core libs provided by materia server
		//
		loadHTMLAndReplaceMateriaScripts: {
			test: /\.html$/i,
			exclude: /node_modules/,
			use: [
				{
					loader: 'file-loader',
					options: { name: '[name].html' }
				},
				{
					loader: 'extract-loader'
				},
				{
					loader: 'string-replace-loader',
					options: { multiple: materiaJSReplacements }
				},
				'html-loader'
			]
		},
		// Process CSS Files
		// Adds autoprefixer
		loadAndPrefixCSS: {
			test: /\.css/i,
			exclude: /node_modules/,
			loader: ExtractTextPlugin.extract({
				use: [
					'raw-loader',
					{
						// postcss-loader is needed to run autoprefixer
						loader: 'postcss-loader',
						options: {
							// add autoprefixer, tell it what to prefix
							plugins: [require('autoprefixer')({browsers: [
								'Explorer >= 11',
								'last 3 Chrome versions',
								'last 3 ChromeAndroid versions',
								'last 3 Android versions',
								'last 3 Firefox versions',
								'last 3 FirefoxAndroid versions',
								'last 3 iOS versions',
								'last 3 Safari versions',
								'last 3 Edge versions'
							]})]
						}
					},
				]
			})
		},
		// Process SASS/SCSS Files
		// Adds autoprefixer
		loadAndPrefixSASS: {
			test: /\.s[ac]ss$/i,
			exclude: /node_modules/,
			loader: ExtractTextPlugin.extract({
				use: [
					'raw-loader',
					{
						// postcss-loader is needed to run autoprefixer
						loader: 'postcss-loader',
						options: {
							// add autoprefixer, tell it what to prefix
							plugins: [require('autoprefixer')({browsers: [
								'Explorer >= 11',
								'last 3 Chrome versions',
								'last 3 ChromeAndroid versions',
								'last 3 Android versions',
								'last 3 Firefox versions',
								'last 3 FirefoxAndroid versions',
								'last 3 iOS versions',
								'last 3 Safari versions',
								'last 3 Edge versions'
							]})]
						}
					},
					'sass-loader'
				]
			})
		}
	}

	let plugins = {
		clean: new CleanPlugin([outputPath]),
		copy: new CopyPlugin(copyList),
		extract: new ExtractTextPlugin({filename: '[name]'}),
		zip: new ZipPlugin({
			path: `${outputPath}_output`,
			filename: cfg.cleanName,
			extension: 'wigt'
		})
	}

	return {
		devServer: {
			// contentBase: path.join(__dirname, 'node_modules', 'materia-widget-dev', 'build'),
			contentBase: path.join(__dirname, 'build'),
			headers:{
				// add headers to every response
				// allow iframes to talk to their parent containers
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
			},
			port: process.env.PORT || 8118,
			setup: MateriaDevServer
		},

		// These are the default js and css files
		entry: {
			'creator.js': [
				path.join(srcPath, 'creator.coffee')
			],
			'player.js': [
				path.join(srcPath, 'player.coffee')
			],
			'creator.css': [
				path.join(srcPath, 'creator.html'),
				path.join(srcPath, 'creator.scss')
			],
			'player.css': [
				path.join(srcPath, 'player.html'),
				path.join(srcPath, 'player.scss')
			]
		},

		// write files to the outputPath (default = ./build) using the object keys from 'entry' above
		output: {
			path: outputPath,
			filename: '[name]',
			publicPath: ''
		},

		module: {
			rules: [
				rules.loaderDoNothingToJs,
				rules.loaderCompileCoffee,
				rules.copyImages,
				rules.loadHTMLAndReplaceMateriaScripts,
				rules.loadAndPrefixCSS,
				rules.loadAndPrefixSASS
			]
		},
		plugins: [
			// clear the build directory
			plugins.clean,
			// copy all the common resources to the build directory
			plugins.copy,
			// extract css from the webpack output
			plugins.extract,
			// zip everything in the build path to zip dir
			plugins.zip
		]
	};
}

module.exports = {
	materiaJSReplacements: materiaJSReplacements,
	configFromPackage: configFromPackage,
	getLegacyWidgetBuildConfig: getLegacyWidgetBuildConfig,
}
