Namespace('Materia').Splash = do ->
	init = ->
		Materia.Coms.Json.send 'saved_qsets', [], (data) ->
			# console.log data
			for id, name of data
				$('#qsets').append '<option value="'+id+'">'+name+'</option>'

		$('#player_button').click ->
			window.location.href = 'player/' + $('#qsets').val()

		$('#creator_button').click ->
			window.location.href = 'creator/' + $('#qsets').val()

	init: init
