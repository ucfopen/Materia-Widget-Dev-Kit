const path = require('path')
const CleanWebpackPlugin = require('clean-webpack-plugin')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')

const mwdkSrcPath  = path.resolve(__dirname, 'src');
const buildPath   = path.resolve(__dirname, 'build') + path.sep

module.exports = [
	{
		entry: {
			'mwdk-splash.js': [
				path.join(mwdkSrcPath, 'mwdk.splash.js')
			],
			'mwdk-package.js': [
				path.join(mwdkSrcPath, 'mwdk.package.js'),
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
			new CleanWebpackPlugin(),
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
	// this used to be here to enable a single webpack to build
	// both MSCA and this project at the same time
	// I think it's less usefull now that npm packages come with pre-built assets
	// I'm leaving it here for now...
	// It'd probably be safe to delete this some time after v2.1.0 lands
	// require('materia-server-client-assets/webpack.config.js')
]
