Namespace('MWDK').Package = (() => {

	var showPackageDownload = () => {
		var embed;
		embed = document.createElement('iframe');
		embed.id = 'mwdk_dialog';
		embed.setAttribute('frameborder', 0);
		embed.setAttribute('src', '/mwdk/package');
		document.getElementById('modalbg').appendChild(embed);
		document.getElementById('modalbg').classList.add('visible');
	};

	var showDemoPreview = () => {
		window.location.pathname='/preview';
	}

	var showDemoCreator = () => {
		window.location.href='/mwdk/widgets/1-mwdk/create#demo';
	}

	var showCreator = () => {
		window.location.href='/mwdk/widgets/1-mwdk/create#1';
	}

	var closeDialog = () => {
		var dialog;
		dialog = document.getElementById('mwdk_dialog');
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
		showPackageDownload: showPackageDownload,
		showDemoPreview: showDemoPreview,
		showCreator: showCreator,
		showDemoCreator: showDemoCreator
	};
})();
