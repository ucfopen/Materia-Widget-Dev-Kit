const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

const srcPath = path.resolve(process.cwd(), 'src') + path.sep;
const buildPath = path.resolve(process.cwd(), 'build') + path.sep;

module.exports =
	{
		mode: 'production',
		entry: {
			'mwdk-splash.js': [
				path.join(srcPath, 'mwdk.splash.js')
			],
			'mwdk-package.js': [
				path.join(srcPath, 'mwdk.package.js'),
			],
			'mwdk-helpers.js': [
				path.join(srcPath, 'mwdk.helpers.js')
			]
		},

		// write files to the outputPath (default = ./build) using the object keys from 'entry' above
		output: {
			path: buildPath,
			filename: '[name]',
			publicPath: buildPath,
			// clean: true
		},
		module: {
			rules: [
				{
					test: /\.css$/i,
					use: [
						{
							loader: MiniCssExtractPlugin.loader
						},
						{
							loader: "css-loader",
							options: {
								url: false,
							},
						},
					],
				},
				{
					test: /\.js$/i,
					use: [
						{
							loader: "babel-loader"
						}
					],
				},
			],
		},
		plugins: [
			new MiniCssExtractPlugin(),
			// new CleanWebpackPlugin(),
			new CopyPlugin({
				patterns: [
					{
						from: path.resolve(__dirname, 'assets', 'img'),
						to: path.resolve(buildPath, 'img'),
						toType: 'dir'
					}
				],
			}),
			new HtmlWebpackPlugin()
		],
	// this used to be here to enable a single webpack to build
	// both MSCA and this project at the same time
	// I think it's less usefull now that npm packages come with pre-built assets
	// I'm leaving it here for now...
	// It'd probably be safe to delete this some time after v2.1.0 lands
	// require('materia-server-client-assets/webpack.config.js')
}
