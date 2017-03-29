Namespace('Materia').Player = do ->
	base_url = null
	converted_instance = null
	embed_done_dfd = null
	embed_target = null
	inst_id = null
	instance = null
	is_embedded = false
	is_preview = false
	log_interval = 10000
	no_flash = false
	pending_logs =
	  play: []
	  storage: []
	play_id = null
	qset = null
	start_time = 0
	widget = null
	widget_type = null
	end_state = null
	end_logs_pending = false
	score_screen_pending = false
	end_logs_sent = false
	heartbeat_interval_id = -1
	score_screen_url = null

	init = (_gateway, _inst_id, _embed_target, _base_url) ->
		embed_target = _embed_target
		inst_id = _inst_id
		base_url = _base_url
		for word in String(window.location).split('/')
			if word == 'preview'
				is_preview = true
				$('body').addClass 'preview'
				$('.center').prepend $('<header>').addClass('preview-bar')
				break
		is_embedded = top.location isnt self.location
		$.when(getWidgetInstance(), startPlaySession())
			.pipe(getQuestionSet)
			.pipe(embed)
			.pipe(sendWidgetInit)
			.pipe(startHeartBeat)
			.fail(onLoadFail)

	getWidgetInstance = ->
		dfd = $.Deferred()

		if no_flash
			dfd.reject 'Flash Player required.'

		Materia.Coms.Json.send 'widget_instances_get', [[inst_id]], (instances) ->
			if instances.length < 1
				dfd.reject 'Unable to get widget info.'

			instance = instances[0]

			type = instance.widget.player.split('.').pop()

			version = parseInt instance.widget.files.flash_version, 10
			if type == 'swf' && swfobject.hasFlashPlayerVersion(String(version)) == false
				dfd.reject 'Newer Flash Player version required.'
			else
				if instance.widget.width > 0
					$('.center').width instance.widget.width
				if instance.widget.height > 0
					$('.center').height instance.widget.height
				dfd.resolve()
			$('.widget').show()

		dfd.promise()

	startPlaySession = ->
		dfd = $.Deferred()
		switch
			when no_flash then dfd.reject 'Flash Player Required.'
			when is_preview then dfd.resolve()
			else
				play_id = __PLAY_ID

				if play_id?
					dfd.resolve()
				else
					dfd.reject 'Unable to start play session.'

		dfd.promise()

	getQuestionSet = ->
		dfd = $.Deferred()
		Materia.Coms.Json.send 'question_set_get', [inst_id, play_id], (result) ->
			if window.qset
				qset = window.qset
				dfd.resolve()
			qset = result
			document.getElementById('qset').innerHTML = JSON.stringify result, null, 2
			dfd.resolve()
		dfd.promise()

	embed = ->
		dfd = $.Deferred()
		widget_type = instance.widget.player.slice instance.widget.player.lastIndexOf('.')
		embedHTML dfd
		dfd.promise()

	embedHTML = (dfd) ->
		embed_done_dfd = dfd
		iframe = $('<iframe src="build/player.html" id="container" class="html"></iframe>')
		$('#container').replaceWith iframe
		a = document.createElement 'a'
		a.href = STATIC_CROSSDOMAIN
		expected_origin = a.href.substr 0, a.href.length - 1
		onPostMessage = (e) ->
			if e.origin == expected_origin
				msg = JSON.parse e.data
				switch msg.type
					when 'start' then onWidgetReady()
					when 'addLog' then addLog msg.data
					when 'end' then end msg.data
					when 'sendStorage' then sendStorage msg.data
					when 'sendPendingLogs' then sendPendingLogs()
					when 'alert' then alert msg.data
					when 'setHeight' then setHeight msg.data[0]
					else throw new Error 'Unknown PostMessage received from player core: '+ msg.type
			else
				throw new Error 'Post message Origin does not match. Expected: ' + expected_origin + ', Actual: ' + e.origin
		if typeof addEventListener isnt 'undefined' and addEventListener isnt null
			addEventListener 'message', onPostMessage, false
		else if typeof attachEvent isnt 'undefined' and attachEvent isnt null
			attachEvent 'onmessage', onPostMessage

	sendWidgetInit = ->
		dfd = $.Deferred().resolve()
		converted_instance = translateForApiVersion instance
		start_time = new Date().getTime()
		sendToWidget 'initWidget', [qset, converted_instance, base_url]
		if not is_preview
			heartbeat_interval_id = setInterval sendPendingLogs, log_interval

	startHeartBeat = ->
		dfd = $.Deferred().resolve()
		heartbeat = setInterval ->
			Materia.Coms.Json.send 'session_valid', [null, false], (data) ->
				if data != true
					alert 'You have been logged out due to inactivity.\n\nPlease log in again.'
					stopHeartBeat()
		, 30000
		dfd.promise()

	onLoadFail = (msg) ->
		alert 'Failure: ' + msg

	onWidgetReady = ->
		widget = $('#container').get 0
		switch
			when qset is null then embed_done_dfd.reject 'Unable to load widget data.'
			when widget is null then embed_done_dfd.reject 'Unable to load widget.'
			else embed_done_dfd.resolve()

	# converts current widget/instance structure to the one expected by the player
	translateForApiVersion = (inst) ->
		# switch based on version expected by the widget
		switch parseInt inst.widget.api_version
			when 1
				output =
					startDate: inst.open_at
					playable: inst.widget.is_playable
					embedUrl: inst.embed_url
					engineName: inst.widget.name
					endDate: inst.close_at
					GRID: inst.widget.id
					type: inst.widget.type
					dateCreate: inst.created_at
					version: ''
					playUrl: inst.play_url
					QSET: inst.qset
					isDraft: inst.is_draft
					height: inst.widget.height
					dir: inst.group
					storesData: inst.widget.is_storage_enabled
					name: inst.name
					engineID: inst.widget.id
					GIID: inst.id
					flVersion: inst.flash_version
					isQSetEncrypted: inst.widget.is_qset_encrypted
					cleanName: inst.widget.clean_name
					attemptsAllowed: inst.attempts
					recordsScores: inst.widget.is_scorable
					width: inst.widget.width
					isAnswersEncrypted: inst.widget.is_answer_encrypted
					cleanOwner: ''
					editable: inst.widget.is_editable
					previewUrl: inst.preview_url
					userID: inst.user_id
					scoreModule: inst.widget.score_module
			when 2
				output = inst
			else
				output = inst
		output

	sendToWidget = (type, args) ->
		switch widget_type
			when '.swf' then widget[type].apply widget, args
			when '.html' then widget.contentWindow.postMessage JSON.stringify({type: type, data: args}), STATIC_CROSSDOMAIN

	sendPendingLogs = (callback) ->
		if callback is null
			callback = $.noop
		$.when(sendPendingStorageLogs())
			.pipe(sendPendingPlayLogs)
			.done(callback)
			.fail ->
				alert 'There was a problem saving'

	sendPendingStorageLogs = ->
		dfd = $.Deferred()
		if not is_preview and pending_logs.storage.length > 0
			Materia.Coms.Json.send 'play_storage_data_save', [play_id, pending_logs.storage], ->
				dfd.resolve()
			pending_logs.storage = []
		else
			dfd.resolve()
		dfd.promise()

	sendPendingPlayLogs = ->
		dfd = $.Deferred()
		if pending_logs.play.length > 0
			args = [play_id, pending_logs.play]
			if is_preview
				args.push inst_id
			Materia.Coms.Json.send 'play_logs_save', args, (result) ->
				if result isnt null and result.score_url?
					score_screen_url = result.score_url
				dfd.resolve()
			pending_logs.play = []
		else
			dfd.resolve()
		dfd.promise()

	sendAllPendingLogs = (callback) ->
		callback = $.noop if !callback?

		$.when(sendPendingStorageLogs())
			.pipe(sendPendingPlayLogs)
			.done(callback)
			.fail ->
				alert 'There was a problem saving.'

	setHeight = (h) ->
		$('#container').height h

	addLog = (log) ->
		log['game_time'] = ((new Date()).getTime() - start_time) / 1000 # log time in seconds
		pending_logs.play.push log

	end = (show_score_screen_after = yes) ->
		switch end_state
			when 'sent'
				showScoreScreen() if show_score_screen_after
			when 'pending'
				if show_score_screen_after then score_screen_pending = yes
			else
				end_state = 'pending'
				# kill the heartbeat
				clearInterval heartbeat_interval_id
				# required to end a play
				addLog({type:2, item_id:0, text:'', value:null})
				# send anything remaining
				sendAllPendingLogs ->
					# Async callback after final logs are sent
					end_state = 'sent'
					# shows the score screen upon callback if requested any time betwen method call and now
					if show_score_screen_after or score_screen_pending then showScoreScreen()

	showScoreScreen = ->
		if score_screen_url is null
			if is_preview
				score_screen_url = '' + BASE_URL + 'scores/preview/' + inst_id
			else if is_embedded
				score_screen_url = '' + BASE_URL + 'scores/embed/' + inst_id
			else
				score_screen_url = '' + BASE_URL + 'scores/' + inst_id
		window.location = score_screen_url

	init: init
