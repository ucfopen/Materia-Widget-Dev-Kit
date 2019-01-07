const fs = require('fs')

function GenerateWidgetHash(options) {
	const apply = function(compiler) {
		compiler.plugin('emit', function(compilation, callback) {
			console.log('Hello World!')
			// adding a new line item for each filename.
			for (var filename in compilation.assets) {
				if (filename.match(/\.wigt$/i) != null) {
					var file = compilation.assets[filename].source()
					var crypto = require('crypto')
					var fs = require('fs')

					var shasum = crypto.createHash('sha1')
					shasum.update(file)
					var hashSha1 = shasum.digest('hex')

					shasum = crypto.createHash('md5')
					shasum.update(file)
					var hashmd5 = shasum.digest('hex')

					shasum = crypto.createHash('sha256')
					shasum.update(file)
					var hashsha256 = shasum.digest('hex')

					var gitCommit = 'unkown'
					var email = 'unkown'
					var user = 'unkown'
					var gitRemote = 'unkown'

					try {
						var execSync = require('child_process').execSync
						gitCommit = execSync('git rev-parse HEAD').toString()
						gitRemote = execSync('git remote get-url origin').toString()
						email = execSync('git config user.email').toString()
						user = execSync('git config user.name').toString()
					} catch (error) {
						console.log('Error getting build data')
						console.warn(error)
					}
				}
			}

			// find the widget's file name

			// build checksum content
			var date = new Date()

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

			// add checksum to the output
			compilation.assets[options.output] = {
				source: function() {
					return checksumYAML
				},
				size: function() {
					return checksumYAML.length
				}
			}

			callback()
		})
	}

	return {
		apply: apply
	}
}

module.exports = GenerateWidgetHash
