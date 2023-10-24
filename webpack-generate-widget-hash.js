const fs = require('fs')
const crypto = require('crypto')
const execSync = require('child_process').execSync
const { sources } = require('webpack');

class GenerateWidgetHash {
	constructor(options = {}) {
		this.widget = options.widget;
		this.output = options.output;
	}
	apply(compiler) {
		compiler.hooks.emit.tapAsync('GenerateWidgetHash', (compilation, callback) => {
			// if widget isnt in options or it isnt in the output, just warn and exit
			if (typeof this.widget == 'undefined' || typeof compilation.assets[this.widget] == 'undefined') {
				console.warn('Widget Hash generator couldnt locate ' + this.options.widget)
				callback()
				return
			}
			compilation.hooks.processAssets.tap({
				name: 'GenerateWidgetHash',
				stage: compilation.PROCESS_ASSETS_STAGE_ADDITIONAL, // see below for more stages
				additionalAssets: true
			},
			(assets) => {
				const wigtData = assets[this.widget].source()

				// calculate hashes based on the wigt file
				var hashmd5 = crypto.createHash('md5').update(wigtData).digest('hex')
				var hashSha1 = crypto.createHash('sha1').update(wigtData).digest('hex')
				var hashsha256 = crypto.createHash('sha256').update(wigtData).digest('hex')

				// get some build environment information
				var date = new Date()
				var gitCommit = 'unkown'
				var email = 'unkown'
				var user = 'unkown'
				var gitRemote = 'unkown'

				try {
					gitCommit = execSync('git rev-parse HEAD').toString()
					gitRemote = execSync('git remote get-url origin').toString()
					email = execSync('git config user.email').toString()
					user = execSync('git config user.name').toString()
				} catch (error) {
					console.log('Error getting build data')
					console.warn(error)
				}

				// build checksum content
				var checksumYAML =
					`build_date: ${date.toISOString()}` +
					'\r\n' +
					`git: ${gitRemote.trim()}` +
					'\r\n' +
					`git_version: ${gitCommit.trim()}` +
					'\r\n' +
					`git_user: ${user.trim()}` +
					'\r\n' +
					`git_user_email: ${email.trim()}` +
					'\r\n' +
					`sha1: ${hashSha1.trim()}` +
					'\r\n' +
					`sha256: ${hashsha256.trim()}` +
					'\r\n' +
					`md5: ${hashmd5.trim()}` +
					'\r\n'

				compilation.emitAsset(
					this.output,
					new RawSource(checksumYAML)
				)
			})

			callback()
		})
	}
}

module.exports = GenerateWidgetHash
