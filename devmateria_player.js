var storageData = {};
var currentSelectedTable = "";

function init()
{
	$('#sidebarbtn').click(hideSidebar);
	$(".tabtitle.qset").click(function() { setActiveTab("qset"); });
	$(".tabtitle.storage").click(function() { setActiveTab("storage"); });
	$('#tableselect').change(function() { currentSelectedTable = $('#tableselect').val(); });
	$("#btnReload").click(function()
	{
		window._qset = JSON.parse(document.getElementById("qset").value);
		Materia.Player.init(API_LINK, window.__PLAY_ID, "container", BASE_URL);
	});
	if(window.location.href.lastIndexOf("/preview/") > -1)
	{
		$("#build-commands").css("display", "none");
		$("#switch").css("display", "none");
	}
}

function hideSidebar(e) {
	e.preventDefault();
	var leftbar = document.getElementById("leftbar");
	var btn = document.getElementById("sidebarbtn");
	var center = document.querySelector(".center");

	if (leftbar.className) {
		leftbar.className = "";
		btn.innerHTML = "&larr;";
		center.className = "center";
	} else {
		leftbar.className = "shrink";
		btn.innerHTML = "&rarr;";
		center.className = "center full";
	}
}

function setActiveTab(tab) {
	$('.tabtitle').addClass('deactivated');
	$('.tab').removeClass('visible');

	$('.tabtitle.'+tab).removeClass('deactivated');
	$('.tab.'+tab).addClass('visible');
}

function ajax(url, callback)
{
	var xhr = new XMLHttpRequest();
	xhr.onload = function() { callback(xhr.responseText); };
	xhr.open("GET", url);
	xhr.send();
}

function updateStorage()
{
	ajax("/storage/" + window.__PLAY_ID, function (text)
	{
		if (!text) return;

		var json = JSON.parse(text);
		var bucket = {};
		var options = "";

		for (var i = 0; i < json.length; i++) { bucket[json[i].name] = 1; }

		for (table in bucket) { options += "<option" + (currentSelectedTable == table ? " selected" : "") + ">" + table + "</option>"; }

		document.getElementById("tableselect").innerHTML = options;

		if (!currentSelectedTable) { currentSelectedTable = json[0].name; }

		var html = "<table><tr>";
		for (key in json[0].data) { html += "<td>" + key + "</td>"; }
		html += "</tr>";

		for (var i = 0; i < json.length; i++)
		{
			if (json[i].name == currentSelectedTable)
			{
				html += "<tr>";
				for (key in json[i].data) { html += "<td>" + json[i].data[key] + "</td>"; }
				html += "</tr>";
			}
		}
		html += "</table>";
		document.getElementById("storagetable").innerHTML = html;
	});
}

init();