Namespace('MDK').Package = (() => {

	var showPackageDownload = () => {
		var embed;
		embed = document.createElement('iframe');
		embed.id = 'mdk_dialog';
		embed.setAttribute('frameborder', 0);
		embed.setAttribute('src', '/mdk/package');
		document.getElementById('modalbg').appendChild(embed);
		document.getElementById('modalbg').classList.add('visible');
	};

	var closeDialog = () => {
		var dialog;
		dialog = document.getElementById('mdk_dialog');
		dialog.parentNode.removeChild(dialog);
		document.getElementById('modalbg').classList.remove('visible');
	};

	var build = (url) => {
		window.location.href = url;
		closeDialog();
	};

	var cancel = () => {
		closeDialog();
	};

	return {
		build: build,
		cancel: cancel,
		showPackageDownload: showPackageDownload
	};
})();
