Namespace('Materia').Questions = do ->
	$selectedAssets = []
	$table = null

	_setupTable = ->
		# listener for selecting a question row
		$(document).on 'click', '#question-table tbody tr', (e) ->
			$checkbox = $(this).find(':checkbox')
			$selected = $(this).toggleClass('row_selected').hasClass('row_selected')
			$checkbox.prop 'checked', $selected
			# update checkbox
			# stop the bubbling to prevent the row's click event
			if e.target.type == 'checkbox'
				e.stopPropagation()
			# add or remove the item from the selected ids
			if $selected
				$selectedAssets.push $checkbox.prop('value')
			else
				$selectedAssets.splice $selectedAssets.indexOf($checkbox.prop('value')), 1
			return
		$('#submit-button').click (e) ->
			e.stopPropagation()
			_loadSelectedQuestions $selectedAssets
			false
		$('#cancel-button').click (e) ->
			e.preventDefault()
			e.stopPropagation()
			window.parent.Materia.Creator.onQuestionImportComplete null
			return
		# when the url has changes, reload the questions
		$(window).bind 'hashchange', _loadAllQuestions
		# on resize, re-fit the table size
		$(window).resize ->
			$('div.dataTables_scrollBody').height $(window).height() - 150
			$table.fnAdjustColumnSizing()
			return
		# setup the table
		$table = $('#question-table').dataTable(
			paginate: false
			lengthChange: true
			autoWidth: true
			processing: true
			scrollY: '500px'
			language:
				search: ''
				infoFiltered: ' / _MAX_'
				info: 'showing: _TOTAL_'
			columns: [
				{ data: 'text' }
				{ data: 'type' }
				{ data: 'created_at' }
				{ data: 'uses' }
			]
			sorting: [ [
				2
				'desc'
			] ]
			columnDefs: [
				{
					render: (data, type, full, meta) ->
						d = new Date(data * 1000)
						d.getMonth() + 1 + '/' + d.getDate() + '/' + d.getFullYear()
					targets: 2
				}
				{
					render: (data, type, full, meta) ->
						'<input type="checkbox" name="id" value="' + full.id + '" > <span class="q">' + data + '</span>'
					targets: 0
				}
			])
		# re-fit the table now
		$('div.dataTables_scrollBody').height $(window).height() - 150
		return

	_loadAllQuestions = ->
		$selectedAssets = []
		$('#question-table').dataTable().fnClearTable()
		# clear the table
		# determine the types from the url hash string
		questionTypes = _getType()
		# load
		_getQuestions null, questionTypes, (result) ->
			# to prevent error messages when result is null
			if result != null and !('msg' of result) and result.length > 0
				$('#question-table').dataTable().fnClearTable()
				$('#question-table').dataTable().fnAddData result
			return
		return

	_getQuestions = (questionIds, questionTypes, callback) ->
		Materia.Coms.Json.send 'api/json/questions_get', [
			questionIds
			questionTypes
		], callback
		return

	_loadSelectedQuestions = (questionIds) ->
		_getQuestions questionIds, null, (result) ->
			if typeof result != 'undefined' and result != null and !('msg' of result) and result.length > 0
				window.parent.Materia.Creator.onQuestionImportComplete JSON.stringify(result)
			return
		return

	_getType = ->
		l = document.location.href
		type = l.substring(l.lastIndexOf('=') + 1)
		type

	init = ->
		_setupTable();
		_loadAllQuestions();

	init: init
