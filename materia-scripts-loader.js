// materia-scripts-loader.js

/**
 * Custom HTML loader that replaces Materia script references
 * @param {string} source - The HTML source code
 * @returns {string} - The processed HTML
 */
module.exports = function(source) {
	// Get webpack loader context
	const isRunningDevServer = process.env.NODE_ENV !== "production"

	// Define replacement patterns
	const packagedJSPath = 'src="../../../js/$3"'
	const devServerJSPath = 'src="/materia-assets/js/$3"'
	const replaceTarget = isRunningDevServer ? devServerJSPath : packagedJSPath;

	// Perform replacements
	let result = source
		.replace(/src=(\\?("|')?)(materia.enginecore.js)(\\?("|')?)/g, replaceTarget)
		.replace(/src=(\\?("|')?)(materia.scorecore.js)(\\?("|')?)/g, replaceTarget)
		.replace(/src=(\\?("|')?)(materia.creatorcore.js)(\\?("|')?)/g, replaceTarget)

	return `module.exports = ${JSON.stringify(result)}`
}