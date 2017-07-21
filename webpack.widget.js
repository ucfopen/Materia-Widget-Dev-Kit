let clean        = require('clean-webpack-plugin')
let autoprefixer = require('autoprefixer')
let path         = require('path')
let webpack      = require('webpack')
let copy         = require('copy-webpack-plugin')
let extract      = require('extract-text-webpack-plugin')
let zip          = require('zip-webpack-plugin')

// creators and players may reference materia core files directly
// To do so rather than hard-coding the actual location of those files
//the build process will replace those references with the current relative paths to those files
let materiaJSReplacements = [
	{ search: /src=(\\?("|')?)materia.enginecore.js(\\?("|')?)/g,      replace: 'src=\\"../../../js/materia.enginecore.js\\"' },
	{ search: /src=(\\?("|')?)materia.score.js(\\?("|')?)/g,           replace: 'src=\\"../../../js/materia.score.js\\"' },
	{ search: /src=(\\?("|')?)materia.creatorcore.js(\\?("|')?)/g,     replace: 'src=\\"../../../js/materia.creatorcore.js\\"' },
	{ search: /src=(\\?("|')?)materia.storage.manager.js(\\?("|')?)/g, replace: 'src=\\"../../../js/materia.storage.manager.js\\"' },
	{ search: /src=(\\?("|')?)materia.storage.table.js(\\?("|')?)/g,   replace: 'src=\\"../../../js/materia.storage.table.js\\"' }
];

let configFromPackage = function(){
	let packagePath  = path.join(process.cwd(), 'package.json')
	let packageJson  = require(packagePath)

	return {
		cleanName : packageJson.materia.cleanName.toLowerCase(),
	}
}

const defaultCfg = {
	cleanName: '',
	srcPath: path.join(process.cwd(), 'src'),
	buildPath: path.join(process.cwd(), 'build'),
	demoPath: 'demo.json',
	installPath: 'install.yaml',
	iconsPath: '_icons',
	scorePath: '_score/',
	screenshotsPath: '_screen-shots/',
	assetsPath: 'assets/',
	preCopy: []
}

let buildDefaultConfig = function(config = {}){
	let materiaConfig = configFromPackage()
	cfg = Object.assign({}, defaultCfg, {cleanName:materiaConfig.cleanName}, config)
	let srcPath = cfg.srcPath + path.sep
	let buildPath = cfg.buildPath + path.sep

	return {
		target: 'node',
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

		output: {
			path: buildPath,
			filename: '[name]',
			publicPath: ''
		},

		module: {
			rules: [
				{
					test: /\.coffee$/,
					exclude: /node_modules/,
					loader: extract.extract({
						fallback: 'coffee-loader',
						use: ['raw-loader', 'coffee-loader']
					})
				},
				{
					test: /\.(jpe?g|png|gif|svg)$/i,
					loader: 'file-loader',
					query: {
						emitFile: false,
						publicPath: 'assets/img/',
						name: '[name].[ext]'
					}
				},
				{
					test: /\.html$/,
					exclude: /node_modules/,
					use: [
						{
							loader: 'file-loader',
							options: {
								name: '[name].html'
							}
						},
						{
							loader: 'extract-loader',
							query: 'publicPath=/'
						},
						{
							loader: 'string-replace-loader',
							options: {
								multiple: materiaJSReplacements
							}
						},
						{loader: 'html-loader'}
					]
				},
				{
					test: /\.s[ac]ss$/,
					exclude: /node_modules/,
					loader: extract.extract({
						fallback: 'style-loader',
						use: ['raw-loader', 'postcss-loader', 'sass-loader']
					})
				}
			]
		},
		plugins: [
			// clear the build directory
			new clean(['build']),

			// copy all the common resources to the build directory
			new copy([
				{
					flatten: true,
					from: `${srcPath}${cfg.demoPath}`,
					to: buildPath,
				},
				{
					flatten: true,
					from: `${srcPath}${cfg.installPath}`,
					to: buildPath,
				},
				{
					from: `${srcPath}${cfg.iconsPath}`,
					to: `${buildPath}img`,
					toType: 'dir'
				},
				{
					flatten: true,
					from: `${srcPath}${cfg.scorePath}`,
					to: `${buildPath}_score-modules`,
					toType: 'dir'
				},
				{
					from: `${srcPath}${cfg.screenshotsPath}`,
					to: `${buildPath}img/screen-shots`,
					toType: 'dir'
				},
				{
					from: `${srcPath}${cfg.assetsPath}`,
					to: `${buildPath}assets`,
					toType: 'dir'
				}
			]),

			// extract css from the webpack output
			new extract({filename: '[name]'}),

			// set plugin options for post-css to use autoprefixer
			new webpack.LoaderOptionsPlugin({
				options: {postcss: [ autoprefixer ]}
			}),

			// zip everything in the build path to zip dir
			new zip({
				path: `${buildPath}_output`,
				filename: cfg.cleanName,
				extension: 'wigt'
			})
		]
	};
}

module.exports = {
	materiaJSReplacements:materiaJSReplacements,
	configFromPackage:configFromPackage,
	buildDefaultConfig:buildDefaultConfig,
}
