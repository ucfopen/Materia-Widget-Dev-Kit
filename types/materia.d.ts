declare namespace Materia {
	// Qset
	interface Qset {
		name?: string | null
		items: Qset | QsetItem[]
		options?: any
	}

	interface QsetItem {
		answers: { id?: string | null, text: string, value: number, options?: any }[],
		questions: { text: string }[]
		id: string | number | null,
		materiaType: 'question',
		type: 'QA' | 'MC' | string,
		options?: any,
	}

	// Media Assets
	interface MediaAsset {
		materiaType: 'asset',
		id: string,
		options?: any
	}

	// Widget Descriptions
	interface WidgetGeneralDescription {
		api_version: number,
		group: string,
		width: number,
		height: number,
		in_catalog: 'Yes' | 'No',
		is_answer_encrypted: 'Yes' | 'No',
		is_editable: 'Yes' | 'No',
		is_generable?: 'Yes' | 'No',
		uses_prompt_generation?: 'Yes' | 'No',
		is_playable: 'Yes' | 'No',
		is_qset_encrypted: 'Yes' | 'No',
		is_storage_enabled: 'Yes' | 'No',
		name: string,
	}

	interface WidgetMetadataDescription {
		about: string,
		accessibility_description: string,
		accessibility_keyboard: 'Full' | 'Limited' | 'None',
		accessibility_reader: 'Full' | 'Limited' | 'None',
		excerpt: string,
		features: string[],
		supported_data: string[]
	}

	interface WidgetScoreDescription {
		is_scorable: 'Yes' | 'No',
		score_module: string,
		score_screen: 'scoreScreen.html'
	}

	// Widget
	interface Widget {
		clean_name: string,
		creator: string,
		player: string,
		dir: string,
		files: { player: string, creator: string, flash_version: number }
		general: WidgetGeneralDescription
		width: number,
		height: number,
		href: string,
		meta_data: WidgetMetadataDescription,
		score: WidgetScoreDescription
		is_generable?: '0' | '1',
		uses_prompt_generation?: '0' | '1',
	}

	interface WidgetInstance {
		attempts: string,
		clean_name: string,
		close_at: string,
		created_at: number,
		editable: boolean,
		embed_url: string,
		guest_access: boolean,
		width: number,
		height: number,
		id: string,
		is_draft: boolean,
		name: string,
		open_at: string,
		play_url: string,
		preview_url: string,
		qset: Qset,
		user_id: string,
		widget: Widget,
	}
}

declare namespace Materia.CreatorCore {
	interface Callbacks {
		/**
		 * Callback for when a new instance is being created
		 * @param widget Info about the widget and Materia instance the widget originated from
		 */
		initNewWidget: (widget: Widget, baseUrl: string, mediaUrl: string) => void,
		/**
		 * Callback for when an existing instance is being created
		 * @param title Title of widget instance
		 * @param widgetInstance Object containing info about existing widget instance (e.g. name, id)
		 * @param qset Qset of widget instance
		 * @param qsetVersion Qset version of widget instance
		 */
		initExistingWidget: (title: string, widgetInstance: WidgetInstance, qset: Qset, qsetVersion: number, baseUrl: string, mediaUrl: string) => void,
		/**
		 * Callback after user clicks save, before actually saving
		 * @param mode Type of save
		 */
		onSaveClicked: (mode: 'save' | 'publish' | 'preview') => void,
		/**
		 * Callback after save completed
		 * @param instanceName Name of the widget instance
		 * @param widget Object containing widget details
		 * @param qset Qset of widget instance
		 * @param qsetVersion Qset version of widget instance
		 */
		onSaveComplete: (instanceName: string, widget: Widget, qset: Qset, qsetVersion: number) => void,
		/**
		 * Callback after media import has completed
		 * @param arrayOfMedia Array of media
		 */
		onMediaImportComplete?: (arrayOfMedia: any[]) => void,
		/**
		 * Callback after question import has completed
		 * @param arrayOfQuestions Array of imported questions
		 */
		onQuestionImportComplete?: (arrayOfQuestions: any[]) => void,
		/**
		 * Callback when an LLM responds to your prompt request
		 * @param status Whether or not the request had succeeded or failed
		 * @param resp Response from the LLM
		 */
		onPromptResponse?: (status: 'success' | 'failure', resp: string | null) => void
		/**
		 * Adjust the height of the widget based on window.getComputedStyle; Set to false automatically
		 */
		manualResize?: boolean,
	}

	/**
	 * Signal to Materia that the widget has loaded and pass it callback methods for various creator functions.
	 * @param callbacks Object containing all callback methods.
	 */
	function start(callbacks: Callbacks): void

	/**
	 * Display an alert over the entire page.
	 * @param title Title of alert
	 * @param message Message of alert
	 */
	function alert(title: string, message: string): void

	type ImporterMediaTypes = 'image' | 'audio' | 'video' | 'model'

	/**
	 * Display Materia’s media importer. The importer will allow the user to upload and choose media files to insert into the widget. To make use of this method, make sure you define a onMediaImportComplete callback with Materia.CreatorCore.start.
	 * @param mediaTypes Array of types of media allowed. Other types are accepted, but only for legacy reasons.
	 */
	function showMediaImporter(mediaTypes: ImporterMediaTypes[]): void

	/**
	 * Convert a Materia asset id into a url.
	 * @param mediaId Id of the media file to convert
	 */
	function getMediaUrl(mediaId: string): string

	/**
	 * Send media data directly to the media uploader. Use if the creator has its own file picker or generates media programatically.
	 * @param media File object.
	 */
	function directUploadMedia(media: File): void

	/**
	 * Used to inform the user that a save request cannot be fulfilled.
	 * @param message Message to display to the user.
	 */
	function cancelSave(message: string): void

	/**
	 * Inform Materia to save the current widget instance.
	 * @param title Title of the widget instance.
	 * @param qset Qset of the widget instance.
	 * @param qsetVersion
	 */
	function save(title: string, qset: Qset, qsetVersion?: number): void

	/**
	 * Disables automatic resizing of the widget iframe.
	 * @see {@link start}
	 */
	function disableResizeInterval(): void

	/**
	 * Manually set the pixel height of the widget.
	 * @param height Pixel height of the widget.
	 */
	function setHeight(height: number): void

	/**
	 * Utility function for removing html tags from a string.
	 * @param text Text to escape.
	 */
	function escapeScriptTags(text: string): string

	/**
	 * Submit a prompt for a LLM to process. Be sure to have the 'onPromptResponse' callback registered to receive responses. Only available when enabled on the Materia instance.
	 * @param prompt Prompt for LLM.
	 */
	function submitPrompt(prompt: string): void
}

declare namespace Materia.Engine {
	interface StartOptions {
		/**
		 * A function that is called after the instance and qset data has loaded
		 * @param instance Object containing info about existing widget instance (e.g. name, id)
		 * @param qset Qset of the widget instance
		 * @param version Qset version of the widget instance
		 */
		start: (instance: WidgetInstance, qset: Qset, version: number) => void,
		/**
		 * Adjust the height of the widget based on window.getComputedStyle; Set to false automatically
		 */
		manualResize?: boolean,
	}

	/**
	 * Signals that your widget is done loading its assets and passes a callback that will receive widget instance data.
	 * @param options Object containing callback and start options
	 */
	function start(options: StartOptions): void

	/**
	 * Queues a log to send to the server. Logs must conform to certain value constraints.
	 * @param type Log type
	 * @param itemId Item ID that pertains to the log
	 * @param text @TODO
	 * @param value @TODO
	 */
	function addLog(type: number, itemId?: number, text?: string, value?: any): void

	/**
	 * Ask Materia to display a stylized Alert message.
	 * @param title Title of the alert window
	 * @param message Message to display in the alert
	 * @param type @TODO
	 */
	function alert(title: string, message: string, type?: string): void

	/**
	 * Convert a Materia asset id into a url.
	 * @param mediaId Id of the media file to convert
	 */
	function getMediaUrl(mediaId: string): string

	/**
	 * Mark the widget play as finished. No more logs will be accepted after end is called. By default, calling end will jump to the score screen.
	 * @param showScoreScreenAfter Set to false to prevent Materia from jumping to the score screen. Defaults to true.
	 */
	function end(showScoreScreenAfter?: boolean): void

	/**
	 * Request that the engine core immediately sends any pending logs to the server. Automatically called by end.
	 */
	function sendPendingLogs(): void

	/**
	 * Do not use directly
	 * @see {link Materia.Score}
	 */
	function sendStorage(): void

	/**
	 * Disables automatic resizing of the widget iframe.
	 * @see {link start}
	 */
	function disableResizeInterval(): void

	/**
	 * Manually set the pixel height of the widget.
	 * @param height Height in pixels of the widget
	 */
	function setHeight(height: number): void

	/**
	 * Utility function for removing html tags from a string.
	 * @param text Text to escape
	 */
	function escapeScriptTags(text: string): string
}

declare namespace Materia.Score {
	/**
	 * Widget interactions are a catch-all category for any (logged) widget activity that isn’t categorized as an answered question or final score.
	 * It’s up to the score module to make sense of the interaction and grade the widget appropriately.
	 * Examples include an individual question modifier (hint used, -50%), an overall score modifier (-20% to final score), or more esoteric cases.
	 * @param questionId Question Id associated with the interaction, if applicable. The score module can ignore it for cases where it doesn’t apply.
	 * @param interactionType A string identifying what the interaction is, e.g.: ‘hint_used’, ‘attempt_penalty’, etc.
	 * @param value The value of the interaction, if applicable.
	 */
	function submitInteractionForScoring(questionId: string | 0, interactionType: string, value?: any): void

	/**
	 * A final score submission from the client. In some situations, a widget may not pass back logs for individual questions/interactions, and only pass back a final score. For example, perhaps the widget scores on the client side and only provides the score.
	 * @param questionId If the final score is being determined by an individual question, its ID can be used here. Otherwise, just use 0.
	 * @param userAnswer If the final score is determined based on a user’s answer. Can be an empty string otherwise.
	 * @param score The final score to return.
	 */
	function submitFinalScoreFromClient(questionId: string | 0, userAnswer: string, score: number): void

	/**
	 * An answered question submission. This is the most basic log type. Used in most ordinary responses for individual questions.
	 * @param questionId The ID of the question being answered.
	 * @param userAnswer The response the user provided. This string is matched against the widget’s QSET on the server to determine the correct answer.
	 * @param value The value isn’t by default used to determine the score of the question, however it can be used to pass an additional value to be used in scoring
	 */
	function submitQuestionForScoring(questionId: string, userAnswer: string, value?: any): void

	/**
	 * Adds a message/feedback to the overall score screen.
	 * @param message Message to display on the score screen
	 */
	function addGlobalScoreFeedback(message: string): void

	/**
	 * Adds an unspecified type of score data for processing by a custom score module.
	 * @param data Object to store in the score logs
	 */
	function addScoreData(data: any): void
}

declare namespace Materia.ScoreCore {
	interface ScoreTableItem {
		data: any,
		data_style: string[],
		feedback: string | null,
		graphic: string,
		score: string,
		style: string,
		symbol: string,
		tag: string,
		type: string,
	}

	interface Callbacks {
		/**
		 * Gets called when Materia will provide base information about the play session and score.
		 * @param instance Object containing info about existing widget instance (e.g. name, id)
		 * @param qset Qset of the widget instance
		 * @param scoreTable Object containing all info regarding the player's answers and how the widget is scored
		 * @param isPreview Whether or not this is a preview
		 * @param qsetVersion Qset version of the widget instance
		 */
		start: (instance: WidgetInstance, qset: Qset, scoreTable: ScoreTableItem[], isPreview: boolean, qsetVersion: number) => void
		/**
		 * Gets called when an update has occurred to the score table or qset.
		 * @param qset Updated qset
		 * @param scoreTable Updated score table
		 */
		update: (qset: Qset, scoreTable: ScoreTableItem[]) => void,

		/**
		 * Gets called when Materia is ready to provide you the score distribution. Requests are made through Materia.ScoreCore.requestScoreDistribution().
		 * @param distribution An unsorted number array containing all scores for the current semester.
		 */
		handleScoreDistribution?: (distribution: number[]) => void,
	}

	/**
	 * Signals that your score screen is done loading its assets and passes a keyed object with callbacks to receive data from the server.
	 * @param callbacks Object containing required callback methods
	 */
	function start(callbacks: Callbacks): void

	/**
	 * Tells Materia to not display the default results table. By default is is shown. Call this method as soon as possible to reduce UI flashing.
	 */
	function hideResultsTable(): void

	/**
	 * Tells Materia to not display the top score overview section (the final score section above the results table).
	 */
	function hideScoresOverview(): void

	/**
	 * Gets an anonymous and unsorted array containing all completed scores for a widget for the current semester. Make sure you have the handleScoreDistribution callback registered.
	 */
	function requestScoreDistribution()

	/**
	 * Adjusts the height of the score screen in pixels.
	 * @param height Height in pixels
	 */
	function setHeight(height: number): void

	/**
	 * Convert a Materia asset id into a url.
	 * @param mediaId Materia asset id to convert.
	 */
	function getMediaUrl(mediaId: string): string
}

declare namespace Materia.Storage {
	interface MateriaTable {
		getId: () => string,
		init: (id: string, columns: string[]) => void,
		insert: (values: any[]) => void,
		getValues: () => any[][]
	}

	function Table(): MateriaTable
}


declare namespace Materia.Storage.Manager {
	/**
	 * Initialize a table to store data in. Call once per table.
	 * @param tableName Name of the table to create. Avoid spaces and special characters, use underscores.
	 * @param columnName Name of the first column
	 * @param columnsNames Add as many columns as you need
	 */
	function addTable(tableName: string, columnName: string, ...columnsNames: string[]): void

	/**
	 * Get a reference to the table for quick stuff.
	 * @param tableName Name of the table to get. Should match the name it was created with.
	 */
	function getTable(tableName: string): MateriaTable

	/**
	 * Add data into a table.
	 * @param tableName Name of the table to add data to. Should match the name it was created with.
	 * @param firstColumnValue Name of the first column
	 * @param restColumnsValues Add as many columns as you need
	 */
	function insert(tableName: string, firstColumnValue: any, ...restColumnsValues: any[]): void

	/**
	 * Convert a string into a storage table compatible name.
	 * @param name String to convert
	 */
	function clean(name: string): string
}
