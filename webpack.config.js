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
		'mdk-player.js': [
			path.join(mdkSrcPath, 'mdk.package.coffee'),
		],
		'mdk-package.js': [
			path.join(mdkSrcPath, 'mdk.package.coffee'),
		],
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
