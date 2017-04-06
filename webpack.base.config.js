var autoprefixer = require('autoprefixer'),
    clean        = require('clean-webpack-plugin'),
    copy         = require('copy-webpack-plugin'),
    extract      = require('extract-text-webpack-plugin'),
    html         = require('html-webpack-plugin'),
    path         = require('path'),
    webpack      = require('webpack');

var devdir = path.join(__dirname);
var coredir = path.resolve('materia-core', 'coffee');

var builddir = path.resolve('build/'),
    srcdir   = path.resolve('src/');

module.exports = function(args){
	if(args)
	{
		if ('builddir' in args) builddir = args.builddir;
		if ('srcdir' in args) srcdir = args.srcdir;
	}

	config = {
		target: 'node',
		entry: {
			'creator_req': [
				path.join(coredir, 'materia', 'materia-namespace.coffee'),
				path.join(coredir, 'materia', 'materia.creatorcore.coffee'),
				path.join(coredir, 'materia', 'materia.enginecore.coffee'),
				path.join(coredir, 'materia', 'materia.coms.json.coffee'),
				path.join(devdir, 'src', 'devmateria.creator.coffee'),
				path.join(devdir, 'src', 'devmateria.package.coffee')
			],
			'player_req': [
				path.join(coredir, 'materia', 'materia-namespace.coffee'),
				path.join(coredir, 'materia', 'materia.enginecore.coffee'),
				path.join(coredir, 'materia', 'materia.coms.json.coffee'),
				path.join(devdir, 'src', 'devmateria.player.coffee'),
				path.join(devdir, 'src', 'devmateria.package.coffee'),
				path.join(devdir, 'devmateria_player.js'),
				path.join(devdir, 'devmateria_main.js')
			],
			'question_import_req': [
				path.join(coredir, 'materia', 'materia.enginecore.coffee'),
				path.join(coredir, 'materia', 'materia.coms.json.coffee')
			],
			'materia.creatorcore': [
				path.join(coredir, 'materia', 'materia.creatorcore.coffee')
			],
			'materia.enginecore': [
				path.join(coredir, 'materia', 'materia.enginecore.coffee')
			],
			'materia.score': [
				path.join(coredir, 'materia', 'materia.score.coffee')
			]
		},
		output: {
			path: builddir,
			filename: '[name].js',
			publicPath: builddir
		},
		resolve: {
			extensions: ['.js', '.html']
		},
		module: {
			rules: [
				{
					test: /\.coffee$/,
					loader: 'coffee-loader'
				},
				{
					test: /\.scss$/,
					exclude: /node_modules/,
					loader: extract.extract({
						fallback: 'style-loader',
						use: ['raw-loader', 'postcss-loader', 'sass-loader']
					})
				}
			]
		},
		plugins: [
			new copy([
				{
					flatten: true,
					from: srcdir+'*.html',
					to: builddir,
				},
				{
					flatten: true,
					from: srcdir+'*.json',
					to: builddir,
				},
				{
					flatten: true,
					from: srcdir+'*.yaml',
					to: builddir,
				},
				{
					from: srcdir+'_icons',
					to: builddir+'img',
					toType: 'dir'
				},
				{
					flatten: true,
					from: srcdir+'_score',
					to: builddir+'_score-modules',
					toType: 'dir'
				},
				{
					from: srcdir+'_screen-shots',
					to: builddir+'img/screen-shots',
					toType: 'dir'
				},
				{
					from: srcdir+'assets',
					to: builddir+'assets',
					toType: 'dir'
				},
				{
					from: path.join(devdir, 'assets', 'img', 'datatables'),
					to: path.join(builddir, 'datatables'),
					toType: 'dir'
				},
				{
					flatten: true,
					from: path.join(devdir, 'assets', 'css', '*.css'),
					to: builddir
				},
				{
					flatten: true,
					from: path.join(devdir, 'assets', 'img', '*.png'),
					to: builddir
				}
			]),
			new extract({
				filename: '[name].css'
			}),
			new html({
				filename: 'index.html',
				template: path.join(devdir, 'views', 'index.html')
			}),
			new html({
				filename: 'creator_container.html',
				template: path.join(devdir, 'views', 'creator_container.html')
			}),
			new html({
				filename: 'player_container.html',
				template: path.join(devdir, 'views', 'player_container.html')
			}),
			new html({
				filename: 'question_importer.html',
				template: path.join(devdir, 'views', 'question_importer.html')
			}),
			new html({
				filename: 'download_package.html',
				template: path.join(devdir, 'views', 'download_package.html')
			}),
			new webpack.LoaderOptionsPlugin({
				options: {
					postcss: [ autoprefixer ]
				}
			})
		]
	};

	return config;
};