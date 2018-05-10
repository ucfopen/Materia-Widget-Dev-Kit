Namespace('MDK').Package = do ->
	showPackageDownload = ->
		embed = document.createElement 'iframe'
		embed.id = 'mdk_dialog'
		embed.setAttribute 'frameborder', 0
		embed.setAttribute 'src', '/mdk/package'

		document.getElementById('modalbg').appendChild embed
		document.getElementById('modalbg').classList.add('visible')

	closeDialog = ->
		dialog = document.getElementById 'mdk_dialog'
		dialog.parentNode.removeChild dialog
		document.getElementById('modalbg').classList.remove('visible')

	build = (url) ->
		window.location.href = url
		closeDialog()

	cancel = ->
		closeDialog()

	build: build
	cancel: cancel
	showPackageDownload:showPackageDownload
