// this file was rapidly put together for UCF Hack Day
// It's not exactly optimized, but it's at least functional

Namespace('MWDK').Helpers = (() => {

    var shouldRefresh = false
    var dragAnnotationTarget = -1

    const mode_none = "box_none"
    const mode_pending = "box_pending"
    const mode_drawing = "box_drawing"
    const mode_dragging = "box_dragging"

    var drawBoxMode = mode_none
    var dragBoxTarget = -1
    var dragBoxDelta = { x: 0, y: 0}

    var increment = 0
    
    var annotations = []
    var boxes = []

    var selectedImage = null

    var deleteModeActive = false

    var canvas = document.getElementById("annotation-editor")
    var context = canvas.getContext("2d")

    context.fillStyle = "white"
    context.fillRect(0,0,canvas.width,canvas.height)

    drawCanvas = () => {
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

    // listener for file upload button
    document.getElementById("local-upload-button").addEventListener("change", (event) => {

        let reader = new FileReader()

        reader.onload = (e) => {
            let img = new Image();
            img.addEventListener("load", (e) => {
                selectImage(img, null)
            });
            img.src = e.target.result;
        }

        reader.readAsDataURL(event.target.files[0])
    })

    // upload = local image upload
    // index = index of screenshot (if selected from screenshot selection)
    var selectImage = (upload, index) => {
        document.getElementById("tips").innerHTML = ""

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

    var placeBox = () => {
        if (selectedImage == null) {
            document.getElementById("tips").innerHTML = "You need to select an image first!"
            return
        }
        drawBoxMode = mode_pending
        document.getElementById("tips").innerHTML = "Click and drag (left-to-right) to start drawing a box."
    }

    var placeNumberAnnotation = () => {
        if (selectedImage == null) {
            document.getElementById("tips").innerHTML = "You need to select an image first!"
            return
        }
        var annotation = new Annotation(increment)
        annotations.push(annotation)
        increment++
    }

    // save the canvas as an image
    // NOTE: pretty sure this only works with Webkit browsers
    var saveAsImage = () => {
        if (selectedImage == null) {
            document.getElementById("tips").innerHTML = "You need to select an image first!"
            return
        }
        let dataURL = canvas.toDataURL('image/png');
        let button = document.getElementById("download-image")

        button.setAttribute("download","export.png")
        button.href = dataURL;
    }

    // Handler for mousedown on the canvas element, behavior is contextual
    canvas.addEventListener("mousedown", (event) => {
        if (!shouldRefresh) return
        let x = event.pageX - canvas.offsetLeft
        let y = event.pageY - canvas.offsetTop

        // "Draw box" button clicked, so let's start drawing a box at this location
        if (drawBoxMode == mode_pending) {
            let box = new Box(x, y)
            boxes.push(box)
            drawBoxMode = mode_drawing
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
                    drawBoxMode = mode_dragging
                    dragBoxTarget = i
                    dragBoxDelta.x = x
                    dragBoxDelta.y = y
                    return
                }                
            }
        }
    })

    // mouseup handler for canvas element
    // again, contextual
    canvas.addEventListener("mouseup", (event) => {
        if (!shouldRefresh) return
        
        let x = event.pageX - canvas.offsetLeft
        let y = event.pageY - canvas.offsetTop
        console.log("drag complete, location:")
        console.log("x: " + x + ", y: " + y)

        if (drawBoxMode == mode_drawing || drawBoxMode == mode_pending) {
            document.getElementById("tips").innerHTML = ""
            drawBoxMode = mode_none
        }
        else if (drawBoxMode == mode_dragging) {
            drawBoxMode = mode_none
        }
        else if (dragAnnotationTarget != -1) dragAnnotationTarget = -1
        
    })

    // drag either an annotation or box if required
    canvas.addEventListener("mousemove", (event) => {
        if (!shouldRefresh) return

        let x = event.pageX - canvas.offsetLeft
        let y = event.pageY - canvas.offsetTop

        // drawing a box
        if (drawBoxMode == mode_drawing) {
            let index = boxes.length - 1
            // disallow boxes to be drawn with negative (relative) endX and endY values, which breaks them
            if (x < boxes[index].startX + 10) boxes[index].endX = boxes[index].startX + 10
            else boxes[index].endX = x
            if (y < boxes[index].startY + 10) boxes[index].endY = boxes[index].startY + 10
            else boxes[index].endY = y
        }
        
        // dragging an already drawn box
        else if (drawBoxMode == mode_dragging) {
            let dx = x - dragBoxDelta.x
            let dy = y - dragBoxDelta.y

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
    })

    document.addEventListener("keydown", (event) => {
        // 91 = left CMD, 93 = right CMD. Only compatible with webkit browsers (!)
        if (event.keyCode == 91 || event.keyCode == 93) {
            document.getElementById("tips").innerHTML = "With CMD pressed, click a box or annotation to delete it."
            deleteModeActive = true
            event.preventDefault()
        }
    })

    document.addEventListener("keyup", (event) => {
         // 91 = left CMD, 93 = right CMD. Only compatible with webkit browsers (!)
        if ((event.keyCode == 91 || event.keyCode == 93) && deleteModeActive == true) {
            document.getElementById("tips").innerHTML = ""
            deleteModeActive = false
            event.preventDefault()
        }
    })

    // there isn't an out-of-the-box rounded rectangle function, so we have to draw it manually
    function drawBox(context, startX, startY, endX, endY) {
        let radius = {tl: 5, tr: 5, br: 5, bl: 5}

        let width = endX - startX
        let height = endY - startY

        context.beginPath()
        context.moveTo(startX + radius.tl, startY)
        context.lineTo(startX + width - radius.tr, startY)
        context.quadraticCurveTo(startX + width, startY, startX + width, startY + radius.tr)
        context.lineTo(startX + width, startY + height - radius.br)
        context.quadraticCurveTo(startX + width, startY + height, startX + width - radius.br, startY + height)
        context.lineTo(startX + radius.bl, startY + height)
        context.quadraticCurveTo(startX, startY + height, startX, startY + height - radius.bl)
        context.lineTo(startX, startY + radius.tl)
        context.quadraticCurveTo(startX, startY, startX + radius.tl, startY)
        context.closePath()

        context.lineWidth = 3
        context.strokeStyle = "#4e88ef"
        context.stroke()
    }

    // refresh the canvas based on the time interval (in milliseconds)
    setInterval(drawCanvas, 20)

    return {
        selectImage : selectImage,
        placeNumberAnnotation : placeNumberAnnotation,
        placeBox : placeBox,
        saveAsImage : saveAsImage
    };
    
})();
