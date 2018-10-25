const path              = require('path')
const CleanPlugin       = require('clean-webpack-plugin')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const CopyPlugin        = require('copy-webpack-plugin')
const MateriaClientAssetWebpack = require('materia-server-client-assets/webpack.config.js')

const mdkSrcPath  = path.resolve(__dirname, 'src');
const buildPath   = path.resolve('build') + path.sep

module.exports = [
	{
		entry: {
			'mdk-splash.js': [
				path.join(mdkSrcPath, 'mdk.splash.js')
			],
			'mdk-package.js': [
				path.join(mdkSrcPath, 'mdk.package.js'),
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
					test: /\.js$/i,
					loader: ExtractTextPlugin.extract({
						use: 'raw-loader'
					})
				}
			]
		},

		plugins: [
			new CleanPlugin([buildPath]),
			new ExtractTextPlugin({filename: '[name]'}),
			new CopyPlugin([
				{
					from: path.resolve(__dirname, 'assets', 'img'),
					to: path.resolve(buildPath, 'img'),
					toType: 'dir'
				}
			])
		]
	},
	MateriaClientAssetWebpack
]
