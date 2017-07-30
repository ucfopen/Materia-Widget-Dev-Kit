window.API_LINK = ''
qsets = document.getElementById('qsets')
playerButton = document.getElementById('player_button')
creatorButton = document.getElementById('creator_button')

# load the saved qsets and update the player/creator buttons
fetch 'mdk/saved_qsets'
.then (res) ->
	res.json()
.then (data) ->
	for id, name of data
		newOption = document.createElement("option")
		newOption.text = name
		newOption.value = id
		qsets.add(newOption)

	# update the button urls if a qset is chosen
	qsets.onchange = (e) ->
		playerButton.setAttribute('href', "/mdk/player/#{e.target.value}")
		creatorButton.setAttribute('href', "/mdk/creator/#{e.target.value}")
