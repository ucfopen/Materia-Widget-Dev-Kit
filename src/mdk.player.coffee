# DEFINE GLOBALS
window.storageData = {};
window.currentSelectedTable = "";

window.hideSidebar = (e) =>
	e.preventDefault()
	leftbar = document.getElementById("leftbar")
	btn = document.getElementById("sidebarbtn")
	center = document.querySelector(".center")

	if leftbar.className
		leftbar.className = ""
		btn.innerHTML = "&larr;"
		center.className = "center"
	else
		leftbar.className = "shrink"
		btn.innerHTML = "&rarr;"
		center.className = "center full"

window.setActiveTab = (tab) =>
	$('.tabtitle').addClass('deactivated')
	$('.tab').removeClass('visible')
	$('.tabtitle.'+tab).removeClass('deactivated')
	$('.tab.'+tab).addClass('visible')

window.ajax = (url, callback) =>
	xhr = new XMLHttpRequest()
	xhr.onload = () => callback(xhr.responseText)
	xhr.open("GET", url)
	xhr.send()

window.updateStorage = () =>
	ajax "/storage/#{window.__PLAY_ID}", (text) =>
		if not text then return

		json = JSON.parse(text)
		bucket = {}
		options = ""

		for child in json
			bucket[child.name] = 1

		for table of bucket
			options += "<option" + (currentSelectedTable == table ? " selected" : "") + ">" + table + "</option>";


		document.getElementById("tableselect").innerHTML = options;

		if not currentSelectedTable
			currentSelectedTable = json[0].name

		html = "<table><tr>";
		for key in json[0].data
			html += "<td>#{key}</td>"

		html += "</tr>";

		for child in json
			if child.name == currentSelectedTable
				html += "<tr>";
				for key in child.data
					html += "<td>#{key}</td>"
				html += "</tr>";


		html += "</table>";
		document.getElementById("storagetable").innerHTML = html;

window.init = () =>

	$('#sidebarbtn').click(hideSidebar);
	$(".tabtitle.qset").click () => setActiveTab("qset")
	$(".tabtitle.storage").click () => setActiveTab("storage")
	$('#tableselect').change () => currentSelectedTable = $('#tableselect').val()

	$("#btnReload").click () =>
		window._qset = JSON.parse(document.getElementById("qset").value)
		# MDK.Player.init(API_LINK, window.__PLAY_ID, "container", BASE_URL)

	if window.location.href.lastIndexOf("/preview/") > -1
		$("#build-commands").css("display", "none")
		$("#switch").css("display", "none")

init();
