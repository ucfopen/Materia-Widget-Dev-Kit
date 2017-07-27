Namespace('Materia').Package = do ->
	init = ->
		$('#downloadLink').on 'click', showPackageDownload

	showPackageDownload = ->
		showEmbedDialog '/mdk/package', 500, 280

	showEmbedDialog = (url, w, h) ->
		embed = $('<iframe src="' + url + '" id="embed_dialog" frameborder=0 width='+w+' height='+h+'></iframe>')
		embed.load ->
			return embed.css('top', '30%').css('opacity', 1).css('margin-left', -1*(w/2)+'px')
		$('body').append embed
		$('#modalbg').show();

	closeDialog = ->
		$('#embed_dialog').remove()
		$('#modalbg').hide()

	build = (url) ->
		window.location.href = url
		closeDialog()

	cancel = ->
		closeDialog()

	init: init
	build: build
	cancel: cancel
