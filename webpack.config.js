const path              = require('path')
const CleanPlugin       = require('clean-webpack-plugin')
const ExtractTextPlugin = require('extract-text-webpack-plugin')

const mdkSrcPath  = path.resolve(__dirname, 'src');
const corePath    = path.join('materia-core', 'coffee', 'materia');
const buildPath   = path.resolve('build') + path.sep

module.exports = {
	entry: {
		'mdk-splash.js': [
			path.join(mdkSrcPath, 'mdk.splash.coffee')
		],
		'mdk-creator.js': [
			path.join(mdkSrcPath, 'mdk.creator.coffee'),
			path.join(mdkSrcPath, 'mdk.package.coffee'),
		],
		'mdk-player.js': [
			path.join(mdkSrcPath, 'mdk.player.coffee'),
			path.join(mdkSrcPath, 'mdk.package.coffee'),
		],
		'mdk-question-import.js': [
			path.join(mdkSrcPath, 'mdk.questions.coffee'),
		],
		'materia.coms.json.js': [
			path.join(corePath, 'materia.coms.json.coffee'),
		],
		'materia.namespace.js': [
			path.join(corePath, 'materia.namespace.coffee'),
		],
		'materia.creatorcore.js': [
			path.join(corePath, 'materia.creatorcore.coffee'),
		],
		'materia.enginecore.js': [
			path.join(corePath, 'materia.enginecore.coffee'),
		],
		'materia.score.js': [
			path.join(corePath, 'materia.score.coffee'),
		]
	},

	// write files to the outputPath (default = ./build) using the object keys from 'entry' above
	output: {
		path: buildPath,
		filename: '[name]',
		publicPath: buildPath
	},

	module: {
		rules: [
			{
				test: /\.coffee$/i,
				loader: ExtractTextPlugin.extract({
					use: ['raw-loader', 'coffee-loader']
				})
			}
		]
	},
	plugins: [
		new CleanPlugin([buildPath]),
		new ExtractTextPlugin({filename: '[name]'}),
	]
}
