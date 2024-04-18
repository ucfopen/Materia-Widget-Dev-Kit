// This is an example webpack for a React project

const path = require('path')
const srcPath = path.join(__dirname, 'src') + path.sep
const outputPath = path.join(__dirname, 'build') + path.sep
const widgetWebpack = require('materia-widget-development-kit/webpack-widget')

const rules = widgetWebpack.getDefaultRules()
const copy = [
	...widgetWebpack.getDefaultCopyList()
]

const entries = {
	'player': [
		path.join(srcPath, 'player.html'),
		path.join(srcPath, 'player.js'),
		path.join(srcPath, 'player.scss')
	],
	'creator': [
		path.join(srcPath, 'creator.html'),
		path.join(srcPath, 'creator.js'),
		path.join(srcPath, 'creator.scss')
	],
	'scoreScreen': [
		path.join(srcPath, 'scoreScreen.html'),
		path.join(srcPath, 'scoreScreen.js'),
		path.join(srcPath, 'scoreScreen.scss')
	]
}


const customRules = [
	rules.loadHTMLAndReplaceMateriaScripts,
	rules.loadAndPrefixSASS,
	rules.copyImages,
	rules.reactLoader
]

const options = {
	entries: entries,
	copyList: copy,
	moduleRules: customRules
}

const buildConfig = widgetWebpack.getLegacyWidgetBuildConfig(options)

buildConfig.externals = {
	"react": "React",
	"react-dom": "ReactDOM"
}

module.exports = buildConfig
