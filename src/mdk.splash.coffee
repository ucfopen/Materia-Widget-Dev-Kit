window.API_LINK = ''

# load the saved qsets and update the player/creator buttons
fetch 'mdk/saved_qsets'
.then (res) ->
	res.json()
.then (data) ->
	qsets = document.getElementById('qsets')

	for id, name of data
		newOption = document.createElement("option")
		newOption.text = name
		newOption.value = id
		qsets.add(newOption)

	# update the button urls if a qset is chosen
	qsets.onchange = (e) ->
		document.getElementById('player_button').setAttribute('href', "/mdk/player/#{e.target.value}")
		document.getElementById('creator_button').setAttribute('href', "/mdk/widgets/1-mdk/##{e.target.value}")
