// this file was rapidly put together for UCF Hack Day
// It's not exactly optimized, but it's at least functional

Namespace('MWDK').Helpers = (() => {

	let shouldRefresh = false
	let dragAnnotationTarget = -1

	const MODE_NONE = "box_none"
	const MODE_PENDING = "box_pending"
	const MODE_DRAWING = "box_drawing"
	const MODE_DRAGGING = "box_dragging"

	let drawBoxMode = MODE_NONE
	let dragBoxTarget = -1
	let dragBoxDelta = { x: 0, y: 0}

	let increment = 0

	let annotations = []
	let boxes = []

	let selectedImage = null

	let deleteModeActive = false

	let canvas = document.getElementById("annotation-editor")
	let context = canvas.getContext("2d")

	// object definitions
	function Annotation(inc){
		this.increment = inc
		this.x = 30
		this.y = 30
		this.r = 15
		this.fill = "#4e88ef"
	}

	function Box(x, y) {
		this.startX = x
		this.startY = y
		this.endX = x + 5
		this.endY = y + 5
		this.stroke = "#4e88ef"
	}

	const drawCanvas = () => {
		if (!shouldRefresh) return
		// clear canvas first
		context.clearRect(0, 0, canvas.width, canvas.height)

		// draw BG image
		context.drawImage(selectedImage,0,0, selectedImage.width,selectedImage.height)

		// draw boxes first
		for (box of boxes) {
			drawBox(context, box.startX, box.startY, box.endX, box.endY)
		}

		// then draw annotations
		for (annotation of annotations) {
			context.beginPath()
			context.arc(annotation.x, annotation.y, annotation.r, 0, 2 * Math.PI);
			context.fillStyle = "#4e88ef"
			context.fill()

			context.fillStyle = "white"
			if (annotation.increment < 9) {
				// single character positioning
				context.font = "26px Helvetica"
				context.fillText(annotation.increment+1, annotation.x-7,annotation.y+9)
			}
			else
			{
				// double character positioning - not smart and will look off due to variable width of certain number combos
				context.font= "21px Helvetica"
				context.fillText(annotation.increment+1, annotation.x-12, annotation.y+7)
			}
		}
	}

	// there isn't an out-of-the-box rounded rectangle function, so we have to draw it manually
	const drawBox = (context, startX, startY, endX, endY) => {
		const radius = {tl: 5, tr: 5, br: 5, bl: 5}

		const width = endX - startX
		const height = endY - startY

		context.beginPath()
		// top left
		context.moveTo(startX + radius.tl, startY)
		// to top right
		context.lineTo(startX + width - radius.tr, startY)
		context.quadraticCurveTo(startX + width, startY, startX + width, startY + radius.tr)
		// to bottom right
		context.lineTo(startX + width, startY + height - radius.br)
		context.quadraticCurveTo(startX + width, startY + height, startX + width - radius.br, startY + height)
		// to bottom left
		context.lineTo(startX + radius.bl, startY + height)
		context.quadraticCurveTo(startX, startY + height, startX, startY + height - radius.bl)
		// back to top left
		context.lineTo(startX, startY + radius.tl)
		context.quadraticCurveTo(startX, startY, startX + radius.tl, startY)
		context.closePath()

		context.lineWidth = 3
		context.strokeStyle = "#4e88ef"
		context.stroke()
	}

	// upload = local image upload
	// index = index of screenshot (if selected from screenshot selection)
	const selectImage = (upload, index) => {
		tip("")

		if (upload) {
			selectedImage = upload
		}
		else {
			selectedImage = document.getElementsByClassName("img-selection")[index-1].childNodes[0]
		}

		canvas.width = selectedImage.width
		canvas.height = selectedImage.height

		canvas.setAttribute("style","display: block;")

		shouldRefresh = true
	}

	const placeBox = () => {
		if (selectedImage == null) {
			tip("You need to select an image first!")
			return
		}
		drawBoxMode = MODE_PENDING
		tip("Click and drag (left-to-right) to start drawing a box.")
	}

	const placeNumberAnnotation = () => {
		if (selectedImage == null) {
			tip("You need to select an image first!")
			return
		}
		var annotation = new Annotation(increment)
		annotations.push(annotation)
		increment++
	}

	// save the canvas as an image
	// NOTE: pretty sure this only works with Webkit browsers
	const saveAsImage = () => {
		if (selectedImage == null) {
			tip("You need to select an image first!")
			return
		}
		let dataURL = canvas.toDataURL('image/png');
		let button = document.getElementById("download-image")

		button.setAttribute("download","export.png")
		button.href = dataURL;
	}

	const uploadImage = (event) => {
		let reader = new FileReader()

		reader.onload = (e) => {
			let img = new Image();
			img.addEventListener("load", (e) => {
				selectImage(img, null)
			});
			img.src = e.target.result;
		}

		reader.readAsDataURL(event.target.files[0])
	}

	const tip = (msg) => {
		document.getElementById("tips").innerHTML = msg
	}

	const handleMouseDown = (event) => {
		if (!shouldRefresh) return
		const x = event.pageX - canvas.offsetLeft
		const y = event.pageY - canvas.offsetTop

		// "Draw box" button clicked, so let's start drawing a box at this location
		if (drawBoxMode == MODE_PENDING) {
			let box = new Box(x, y)
			boxes.push(box)
			drawBoxMode = MODE_DRAWING
		}

		// annotations have selection priority over boxes
		// loop through all annotations and check if click coords exist within the annotation's bounding box
		for (let j = 0; j < annotations.length; j++) {
			let annotation = annotations[j]
			if (y > annotation.y - 15 && y < annotation.y + 15 && x > annotation.x - 15 && x < annotation.x + 15) {

				// delete the annotation if deleteMode is active
				if (deleteModeActive) {
					annotations.splice(j, 1)
					return // prevents boxes under this coordinate from being selected too
				}
				else {
					dragAnnotationTarget = j
					return
				}
			}
		}

		// loop through all boxes and check if click coords are within one of the boxes
		for (let i = 0; i < boxes.length; i++) {
			let box = boxes[i]
			if (x > box.startX && x < box.endX && y > box.startY && y < box.endY) {

				if (deleteModeActive) {  // delete if modifier key is held
					boxes.splice(i, 1)
					return
				}
				else { // start dragging
					drawBoxMode = MODE_DRAGGING
					dragBoxTarget = i
					dragBoxDelta.x = x
					dragBoxDelta.y = y
					return
				}
			}
		}
	}

	const handleMouseMove = (event) => {
		if (!shouldRefresh) return

		const x = event.pageX - canvas.offsetLeft
		const y = event.pageY - canvas.offsetTop

		// drawing a box
		if (drawBoxMode == MODE_DRAWING) {
			let index = boxes.length - 1
			// disallow boxes to be drawn with negative (relative) endX and endY values, which breaks them
			if (x < boxes[index].startX + 10) boxes[index].endX = boxes[index].startX + 10
			else boxes[index].endX = x
			if (y < boxes[index].startY + 10) boxes[index].endY = boxes[index].startY + 10
			else boxes[index].endY = y
		}

		// dragging an already drawn box
		else if (drawBoxMode == MODE_DRAGGING) {
			const dx = x - dragBoxDelta.x
			const dy = y - dragBoxDelta.y

			boxes[dragBoxTarget].startX += dx
			boxes[dragBoxTarget].startY += dy
			boxes[dragBoxTarget].endX += dx
			boxes[dragBoxTarget].endY += dy

			dragBoxDelta.x = x
			dragBoxDelta.y = y
		}

		// dragging an annotation
		else if (dragAnnotationTarget != -1) {
			annotations[dragAnnotationTarget].x = x
			annotations[dragAnnotationTarget].y = y
		}
	}

	const handleMouseUp = (event) => {
		if (!shouldRefresh) return

		if (drawBoxMode == MODE_DRAWING || drawBoxMode == MODE_PENDING) {
			tip("")
			drawBoxMode = MODE_NONE
		}
		else if (drawBoxMode == MODE_DRAGGING) {
			drawBoxMode = MODE_NONE
		}
		else if (dragAnnotationTarget != -1) dragAnnotationTarget = -1
	}

	const handleKeyDown = (event) => {
		// 91 = left CMD, 93 = right CMD. Only compatible with webkit browsers (!)
		if (event.keyCode == 91 || event.keyCode == 93) {
			tip("With CMD pressed, click a box or annotation to delete it.")
			deleteModeActive = true
			event.preventDefault()
		}
	}

	const handleKeyUp = (event) => {
		// 91 = left CMD, 93 = right CMD. Only compatible with webkit browsers (!)
		if ((event.keyCode == 91 || event.keyCode == 93) && deleteModeActive == true) {
			tip("")
			deleteModeActive = false
			event.preventDefault()
		}
	}

	// Handler for mousedown on the canvas element, behavior is contextual
	canvas.addEventListener("mousedown", handleMouseDown)

	// mouseup handler for canvas element
	// again, contextual
	canvas.addEventListener("mouseup", handleMouseUp)

	// drag either an annotation or box if required
	canvas.addEventListener("mousemove", handleMouseMove)

	document.addEventListener("keydown", handleKeyDown)

	document.addEventListener("keyup", handleKeyUp)

	// listener for file upload button
	document.getElementById("local-upload-button").addEventListener("change", uploadImage)

	// refresh the canvas based on the time interval (in milliseconds)
	setInterval(drawCanvas, 20)

	context.fillStyle = "white"
	context.fillRect(0,0,canvas.width,canvas.height)

	return {
		drawCanvas : drawCanvas,
		drawBox : drawBox,
		saveAsImage : saveAsImage,
		uploadImage : uploadImage,
		selectImage : selectImage,
		placeNumberAnnotation : placeNumberAnnotation,
		placeBox : placeBox,
		saveAsImage : saveAsImage,
		tip : tip,
		handleKeyDown : handleKeyDown,
		handleKeyUp : handleKeyUp
	};

})();
