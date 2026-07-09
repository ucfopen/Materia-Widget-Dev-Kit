Namespace('MWDK').GuideHack = (() => {
	const handleGuideToggleDarkMode = () => {
		document.getElementById('guide-container').getElementsByTagName('iframe')[0].contentWindow.document.body.classList.toggle('darkMode')
	}

	return {
		handleGuideToggleDarkMode: handleGuideToggleDarkMode
	}
})()
