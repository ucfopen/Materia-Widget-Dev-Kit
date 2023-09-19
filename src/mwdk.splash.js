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
    document.getElementById('player_button').setAttribute('href', "/preview/" + e.target.value)
    document.getElementById('creator_button').setAttribute('href', "/mwdk/widgets/1-mwdk/create#" + e.target.value)
  }
})
