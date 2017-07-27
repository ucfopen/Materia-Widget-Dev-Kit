Namespace('Materia').Splash = do ->
	init = ->
		qsets = document.getElementById('qsets')
		playerButton = document.getElementById('player_button')
		creatorButton = document.getElementById('creator_button')

		# load the saved qsets and update the player/creator buttons
		Materia.Coms.Json.send 'mdk/saved_qsets', [], (data) ->
			for id, name of data
				newOption = document.createElement("option")
				newOption.text = name
				newOption.value = id
				qsets.add(newOption)

			qsets.onchange = (e) ->
				playerButton.setAttribute('href', "/mdk/player/#{e.target.value}")
				creatorButton.setAttribute('href', "/mdk/creator/#{e.target.value}")

	init: init
