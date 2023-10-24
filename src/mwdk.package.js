Namespace('MWDK').Package = (() => {

	var showPackageDownload = () => {
		var embed
		embed = document.createElement('iframe')
		embed.id = 'mwdk_dialog'
		embed.setAttribute('frameborder', 0)
		embed.setAttribute('src', '/mwdk/package')
		document.getElementById('modalbg').appendChild(embed)
		document.getElementById('modalbg').classList.add('visible')
	}

	var showUploadButton = () => {
		document.getElementById('upload-button').removeAttribute('disabled')
	}

	var uploadScoreData = () => {
		let fileUpload = document.getElementById("fileUpload").files[0]
		let fileReader = new FileReader()
		fileReader.readAsText(fileUpload)
		fileReader.onload = function() {
			var xhr = new XMLHttpRequest()
			xhr.open("POST", '/mwdk/upload_score_data', true)
			xhr.setRequestHeader('Content-Type', 'application/json')
			xhr.send(JSON.stringify({
				value: fileReader.result
			}))
			alert(fileReader.result)
			window.location.reload()
		}
		fileReader.onerror = function() {
			alert(fileReader.error)
		}
	}

	var removeScoreData = () => {
		var xhr = new XMLHttpRequest()
		xhr.open("POST", '/mwdk/remove_score_data', true)
		xhr.onreadystatechange = function() {
			if (xhr.readyState === XMLHttpRequest.DONE) {
				if (xhr.status === 200) {
					window.location.reload()
				} else {
					_dom("message", "Score data does not exist or there was an error removing it.")
				}
			}
		}
		xhr.send()

	}

	var removePlayLogs = () => {
		var xhr = new XMLHttpRequest()
		xhr.open("POST", '/mwdk/remove_play_logs', true)
		xhr.onreadystatechange = function() {
			if (xhr.readyState === XMLHttpRequest.DONE) {
				if (xhr.status === 200) {
					window.location.pathname='/mwdk/scores/preview/demo'
				} else {
					_dom("message", "Play logs do not exist or there was an error removing them.")
				}
			}
		}
		xhr.send()
	}

	var showCreator = () => {
		const pathnames = window.location.pathname.split('/')
		const id = window.location.hash?.slice(1) || (pathnames[pathnames.length - 1].match(/([A-Za-z]{5})+/g) ? pathnames[pathnames.length - 1] : 'demo')
		window.location.hash = ''
		window.location.href ='/mwdk/widgets/1-mwdk/create#' + id
	}

	var showPlayer = () => {
		const pathnames = window.location.pathname.split('/')
		const id = window.location.hash?.slice(1) || (pathnames[pathnames.length - 1].match(/([A-Za-z]{5})+/g) && pathnames[pathnames.length - 1] != "create" ? pathnames[pathnames.length - 1] : 'demo')
		window.location.href='/preview/' + id
	}

	var closeDialog = () => {
		var dialog
		dialog = document.getElementById('mwdk_dialog')
		dialog.parentNode.removeChild(dialog)
		document.getElementById('modalbg').classList.remove('visible')
	}

	var toggleJSONInstructions = () => {
		document.querySelector(".json-instructions").classList.toggle("show-dropdown")
	}

	var build = (url) => {
		window.location.href = url
		closeDialog()
	}

	var cancel = () => {
		closeDialog()
	}

	var _dom = (id, msg) => {
		document.getElementById(id).innerHTML = msg
	}

	return {
		build: build,
		cancel: cancel,
		showPackageDownload: showPackageDownload,
		showUploadButton: showUploadButton,
		showCreator: showCreator,
		showPlayer: showPlayer,
		uploadScoreData: uploadScoreData,
		removeScoreData: removeScoreData,
		removePlayLogs: removePlayLogs,
		toggleJSONInstructions: toggleJSONInstructions
	}
})()
