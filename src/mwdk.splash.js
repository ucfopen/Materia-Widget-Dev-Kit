window.API_LINK = ''

fetch('mwdk/saved_qsets')
.then(res => res.json())
.then(data => {
  const qsets = document.getElementById('qsets')

  for (let id in data) {
    let name = data[id]
    let newOption = document.createElement("option")
    newOption.text = name
    newOption.value = (id.length > 0 ? id : "demo")
    qsets.add(newOption)
  }

  qsets.onchange = (e) => {
    let val = e.target.value
    document.getElementById('player_button').setAttribute('href', "/embed/" + val)
    document.getElementById('creator_button').setAttribute('href', "/mwdk/widgets/1-mwdk/create/" + val + "?is_embedded=true")
    if ( ! val) val = 'preview/demo'
    document.getElementById('score_button').setAttribute('href', "/mwdk/scores/" + val)
  }
})
