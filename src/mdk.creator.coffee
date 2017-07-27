Namespace('Materia').Creator = do ->
	creator = null
	embed_done_dfd = null
	embed_target = null
	heartbeat = null
	importer_popup = null
	inst_id = null
	instance = null
	keep_qset = null
	save_mode = false
	type = null
	widget_id = null
	widget_info = null
	widget_type = null

	init = (container, _widget_id, _inst_id) ->
		widget_id = _widget_id
		inst_id = _inst_id
		embed_target = container

		if inst_id isnt null
			$.when(getWidgetInstance())
				.pipe(embed)
				.pipe(getQset)
				.pipe(initCreator)
				.pipe(showButtons)
				.pipe(startHeartBeat)
				.fail(onInitFail)
		else
			$.when(getWidgetInfo())
				.pipe(embed)
				.pipe(initCreator)
				.pipe(showButtons)
				.pipe(startHeartBeat)
				.fail(onInitFail)

	onInitFail = ->
		stopHeartBeat()
		if msg.toLowerCase() isnt 'flash player required.'
			alert 'Failure: ' + msg

	getWidgetInfo = ->
		dfd = $.Deferred()
		Materia.Coms.Json.send 'api/json/widgets_get', [[widget_id]], (widgets) ->
			widget_info = widgets[0]
			dfd.resolve()
		dfd.promise()

	getWidgetInstance = ->
		dfd = $.Deferred()
		Materia.Coms.Json.send 'api/json/widget_instances_get', [[inst_id]], (widgetInstances) ->
			instance = widgetInstances[0];
			widget_info = instance.widget;
			dfd.resolve();
		dfd.promise()

	embed = ->
		dfd = $.Deferred()
		widget_type = widget_info.creator.slice widget_info.creator.lastIndexOf('.')
		# creatorPath = widget_info.creator.substring(0, 4) == 'http' ? widget_info.creator : WIDGET_URL + widget_info.dir + widget_info.creator
		creatorPath = '/mdk/creator.html'
		embedHTML creatorPath, dfd

		$(window).bind 'beforeunload', ->
			importer_popup.close() if importer_popup?
		dfd.promise()

	embedHTML = (htmlPath, dfd) ->
		embed_done_dfd = dfd
		if htmlPath.lastIndexOf '_' > -1
			tempHtmlPath = htmlPath.substr(0, htmlPath.lastIndexOf('_')) + '/'

		$iframe = $('<iframe src="/creator.html" id="container" class="html"></iframe>')
		$('#container').replaceWith $iframe
		onPostMessage = (e) ->
			origin = '' + e.origin + '/'
			if origin == STATIC_CROSSDOMAIN or origin == BASE_URL
				msg = JSON.parse e.data
				switch msg.type
					when 'start' then onCreatorReady()
					when 'save' then save msg.data[0], msg.data[1], msg.data[2]
					when 'cancelSave' then onSaveCanceled msg.data[0]
					when 'showMediaImporter' then showMediaImporter()
					when 'setHeight' then setHeight msg.data[0]
					when 'alert' then alert msg.data.msg
					else alert 'Unknown message from creator: ' + msg.type
			else
				alert 'Error, cross domain restricted for ' + origin
		if typeof addEventListener isnt 'undefined' and addEventListener isnt null
			addEventListener 'message', onPostMessage, false
		else if typeof attachEvent isnt 'undefined' and attachEvent isnt null
			attachEvent 'onmessage', onPostMessage

	onCreatorReady = ->
		creator = $('#container').get 0
		$(window).resize resizeCreator
		resizeCreator()
		$('#creatorPublishBtn').on 'click', onPublishPressed
		$('#creatorPreviewBtn').on 'click', ->
			requestSave 'preview'
		$('#creatorSaveBtn').on 'click', ->
			requestSave 'save'
		embed_done_dfd.resolve()

		# override engine core's getImageAssetUrl method to handle hardcoded demo assets properly
		creator.contentWindow.Materia.CreatorCore.getMediaUrl = (mediaId) ->
			"#{BASE_URL}mdk/media/#{mediaId}"


	save = (instanceName, qset, version) ->
		version = 1 if version is null
		saveData = [
			inst_id,
			instanceName,
			version: version
			data: qset
			,
			save_mode isnt 'publish',
			inst_id,
			null,
			null,
			null
		]
		Materia.Coms.Json.send 'api/json/widget_instance_save', saveData, (inst) ->
			if inst isnt null
				switch save_mode
					when 'preview'
						url = '' + BASE_URL + 'mdk/player/' + inst.id
						popup = window.open url
						if popup isnt null
							setTimeout ->
								unless popup.innerHeight > 0
									onPreviewPopupBlocked inst
							, 200
						else
							onPreviewPopupBlocked inst
						fadeSaveButton $('#previewBtnTxt'), 'Saved!', 'Player (Preview)'
					when 'save'
						fadeSaveButton $('#saveBtnTxt'), 'Saved!', 'Save Draft'
						if inst.warning
							alert inst.warning
							delete inst.warning
						sendToCreator 'onSaveComplete', [inst.name, inst.widget, inst.qset.data, inst.qset.version]
						inst_id = inst.id
						instance = inst

			if inst_id isnt null
				window.history.replaceState {}, '', 'creator/' + inst.id

	onSaveCanceled = (msg) ->
		fadeSaveButton $('#saveBtnTxt'), 'Can Not Save!', 'Save Draft'
		if msg
			alert 'Can not currently save. ' + msg

	showMediaImporter = ->
		onMediaImportComplete [
			id: (Math.random() * 10000).toString 36
		]
		return null

	setHeight = (h) ->
		$('#container').height h

	onPublishPressed = ->
		_cancelPreview null, true
		if inst_id isnt null and instance isnt null and not instance.is_draft
			dialogTemplate = _.template $('#t-update-dialog').html()
		else
			dialogTemplate = _.template $('#t-publish-dialog').html()
		$dialog = $(dialogTemplate())
		$dialog.hide()
		$dialog.find('.cancel_button').on 'click', cancelPublish
		$dialog.find('.action_button').on 'click', ->
			requestSave 'publish'
		$('#creatorPublishBtn').unbind 'click'
		$('.page').prepend $dialog
		$('.publish').slideDown 'slow'

	cancelPublish = (e, instant) ->
		instant = false if instant is null
		e.preventDefault() if e isnt null
		$('.publish .action_button, .publish .cancel_button').unbind 'click'
		$('.publish').slideUp instant ? 'fast' : 'slow', ->
			$('.publish').remove()
			$('#creatorPublishBtn').on 'click', onPublishPressed

	cancelPreview = (e, instant) ->
		instant = false if instant is null
		e.preventDefault() if e isnt null
		$('.preview .action_button, .preview .cancel_button').unbind 'click'
		$('.preview').slideUp instant ? 'fast' : 'slow', ->
			$('.preview').remove()

	enableQuestionImport = ->
		$('#importLink').on 'click', showQuestionImporter

	enablePackageDownload = ->
		Materia.Package.init()

	getQset = ->
		dfd = $.Deferred()
		Materia.Coms.Json.send 'api/json/question_set_get', [inst_id], (data) ->
			keep_qset = data
			dfd.resolve()
		dfd.promise()

	initCreator = ->
		dfd = $.Deferred().resolve()
		if inst_id isnt null
			sendToCreator 'initExistingWidget', [instance.name, instance.widget, keep_qset.data, keep_qset.version, BASE_URL]
		else
			sendToCreator 'initNewWidget', [widget_info, BASE_URL]
		dfd.promise()

	sendToCreator = (type, args) ->
		creator.contentWindow.postMessage JSON.stringify({type:type, data:args}), STATIC_CROSSDOMAIN

	showButtons = ->
		dfd = $.Deferred().resolve()
		if instance and not instance.is_draft
			$('#creatorPublishBtn').html 'Update'
			$('#creatorPreviewBtn').hide()
			$('#creatorSaveBtn').hide()
			$('#action-bar .dot').hide()

		enableReturnLink()
		enableQuestionImport()
		enablePackageDownload()
		$('#action-bar').css 'visibility', 'visible'
		dfd.promise()

	startHeartBeat = ->
		dfd = $.Deferred().resolve()
		heartbeat = setInterval ->
			Materia.Coms.Json.send 'api/json/session_valid', [null, false], (data) ->
				if data != true
					alert 'You have been logged out due to inactivity.\n\nPlease log in again.'
					stopHeartBeat()
		, 30000
		dfd.promise()

	stopHeartBeat = ->
		clearInterval heartbeat

	resizeCreator = ->
		$('.center').height $(window).height() - 145
		$('#container').css 'position', 'relative'

	enableReturnLink = ->
		if inst_id?
			$('#returnLink').html('&larr Return to my widgets').attr('href', getMyWidgetsUrl(inst_id))
		else
			$('#returnLink').html('&larr Return to widget catalog').attr('href', BASE_URL + 'widgets');

	showQuestionImporter = ->
		types = widget_info.meta_data.supported_data
		showEmbedDialog '/mdk/questions/import/?type=' + encodeURIComponent(types.join()), 675, 500
		null

	onPreviewPopupBlocked = (inst) ->
		showEmbedDialog '/mdk/preview_blocked/'+inst.id, 300, 200

	requestSave = (mode) ->
		save_mode = mode
		cancelPublish null, true
		cancelPreview null, true
		switch mode
			when 'preview' then $('#previewBtnTxt').html 'Saving...'
			when 'save' then $('#saveBtnTxt').html 'Saving...'
		sendToCreator 'onRequestSave', [mode]

	fadeSaveButton = ($button, label, finalLabel) ->
		$button.fadeOut ->
			$button.html label
			$button.fadeIn ->
				window.setTimeout ->
					$button.fadeOut ->
						$button.html finalLabel
						$button.fadeIn()
				, 5000

	getMyWidgetsUrl = (inst_id) ->
		'' + BASE_URL + 'my-widgets#' + inst_id;

	showEmbedDialog = (url, w, h) ->
		embed = $('<iframe src="' + url + '" id="embed_dialog" frameborder=0 width='+w+' height='+h+'></iframe>')
		embed.load ->
			return embed.css('top', '20%').css('opacity', 1).css('margin-left', -1*(w/2)+'px')
		$('body').append embed
		$('#modalbg').show();

	onQuestionImportComplete = (questions) ->
		hideEmbedDialog()
		if questions
			sendToCreator 'onQuestionImportComplete', [JSON.parse(questions)]

	onMediaImportComplete = (media) ->
		hideEmbedDialog()
		arr = []
		arr.push element for element in media
		sendToCreator 'onMediaImportComplete', [arr]

	hideEmbedDialog = ->
		$('#embed_dialog').remove();
		$('#modalbg').hide()

	init: init
	onQuestionImportComplete: onQuestionImportComplete
	onMediaImportComplete: onMediaImportComplete
