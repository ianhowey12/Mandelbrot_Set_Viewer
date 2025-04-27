/* eslint-disable radix */
const screenXRatio = 1.3;
const screenYRatio = 1.1;

class Display {
        /**
        * Creates the renderer instance.
        *
        * @param {string} canvasId The id of the canvas to render into
        */
        constructor(canvasId) {
                this.cnv = document.getElementById(canvasId);
                /** @type {WebGLRenderingContext} */
                this.gl = this.cnv.getContext('webgl', {
                alpha: false,
                desynchronized: true,
                antialias: false,
                preserveDrawingBuffer: false,
                });

                // zoom level and placement of the viewport
                this.scaling = 1;
                this.offsetX = 0;
                this.offsetY = 0;

                this.iterations = 500;
                this.lowRes = 0.5;
                this.dragSense = 1.0;
                this.scrollSense = 1.0;
                this.blurValue = 0;
                this.autoSetIter = false;
                this.renderInverse = false;

                this.gradient = true;
                this.period = 0.5;
                this.numColors = 8;

                this.colors = ["ff0000", "ff7f00", "ffff00", "7fff00", "00ff00", "00ff7f", "007fff", "7f007f"];
                this.colorsInt = [0xff0000, 0xff7f00, 0xffff00, 0x7fff00, 0x00ff00, 0x00ff7f, 0x007fff, 0x7f007f];

                // Update checkboxes
                document.getElementById('inverseBox').checked = this.renderInverse;
                document.getElementById('gradientBox').checked = this.gradient;
                document.getElementById('autoBox').checked = this.autoSetIter;

                /** Can drop the resolution with this to gain performance (setCanvasSize has to be called to take effect). Default is 1. */
                this.resolutionScaling = 1;

                // Compile shaders into program
                this.compileProgram();

                // Create buffer of the corner points of the screen
                this.posBuffer = this.createVertexBuffer();

                // Set initial canvas size and set the view to fit the fractal inside
                this.setCanvasSize();
                this.resetView();
                // If the viewport size chages (browser window resized or orientation change on phones)
                // Change the size of the canvas accordingly and rerender the image
                window.onresize = () => { this.setCanvasSize(); this.render(); };

                // Set event listeners for zooming
                this.cnv.addEventListener('wheel', this.handleScroll.bind(this));

                // Set event listeners for moving the viewport
                this.cnv.addEventListener('mousedown', this.handleMouseDown.bind(this));
                this.cnv.addEventListener('mouseup', this.handleMouseUp.bind(this));
                this.cnv.addEventListener('mousemove', this.handleMouseMove.bind(this));
                this.cnv.addEventListener('touchstart', this.handleTouchStart.bind(this));
                this.cnv.addEventListener('touchend', this.handleTouchEnd.bind(this));
                this.cnv.addEventListener('touchmove', this.handleTouchMove.bind(this));
                this.mouseIsDown = false;

                // Store the IDs and coodinates of the current ongoing touches
                // on the screen for processing pinch zoom gestures
                /** @type {number[]} */
                this.touchIDs = [];
                /** @type {{x:number,y:number}[]} */
                this.touchCoords = [];
        }

        render() {
                this.gl.clearColor(0.8, 0.8, 0.8, 1.0);
                this.gl.clearDepth(1.0);
                this.gl.enable(this.gl.DEPTH_TEST);
                this.gl.depthFunc(this.gl.LEQUAL);

                // eslint-disable-next-line no-bitwise
                this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

                const vertexPos = this.gl.getAttribLocation(this.shaderProgram, 'aVertexPosition');
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.posBuffer);
                this.gl.vertexAttribPointer(vertexPos, 2, this.gl.FLOAT, false, 0, 0);
                this.gl.enableVertexAttribArray(vertexPos);

                this.gl.useProgram(this.shaderProgram);
                const offset = 0;
                const vertexCount = 4;
                this.gl.uniform2f(this.resolutionLocation, this.gl.canvas.width, this.gl.canvas.height);
                this.gl.uniform1f(this.scalingLocation, this.scaling);
                this.gl.uniform2f(this.offsetsLocation, this.offsetX, this.offsetY);
                this.gl.drawArrays(this.gl.TRIANGLE_STRIP, offset, vertexCount);
        }

        // Load and compile shaders, link them into a program
        compileProgram() {
                // Load vertex shader (only used because it's mandatory)
                this.vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER);
                // Load source from the html page
                this.gl.shaderSource(this.vertexShader, document.getElementById('vShader').firstChild.textContent);
                this.gl.compileShader(this.vertexShader);
                // Load the fragment shader used to render the image
                this.renderShader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
                // Load source from the static function with the right number of iterations
                this.gl.shaderSource(this.renderShader,
                Display.getRenderSource(
                        this.iterations, this.gradient, this.period, this.numColors, this.colorsInt, this.renderInverse
                ));
                this.gl.compileShader(this.renderShader);
                // Check for errors
                if (!this.gl.getShaderParameter(this.renderShader, this.gl.COMPILE_STATUS)) {
                throw new Error(`An error occurred compiling the render shader: ${this.gl.getShaderInfoLog(this.renderShader)}`);
                }

                // Link into program
                this.shaderProgram = this.gl.createProgram();
                this.gl.attachShader(this.shaderProgram, this.vertexShader);
                this.gl.attachShader(this.shaderProgram, this.renderShader);
                this.gl.linkProgram(this.shaderProgram);
                // Check for errors
                if (!this.gl.getProgramParameter(this.shaderProgram, this.gl.LINK_STATUS)) {
                throw new Error('Error loading the shaders');
                }

                // Get and store locations of uniforms in the shaders
                this.resolutionLocation = this.gl.getUniformLocation(this.shaderProgram, 'resolution');
                this.scalingLocation = this.gl.getUniformLocation(this.shaderProgram, 'scaling');
                this.offsetsLocation = this.gl.getUniformLocation(this.shaderProgram, 'offsets');

                // Set inputs
                document.getElementById('iterInput').value = this.iterations.toFixed();
                document.getElementById('lowResInput').value = this.lowRes.toFixed();
                document.getElementById('dragSenseInput').value = this.dragSense;
                document.getElementById('scrollSenseInput').value = this.scrollSense;
                document.getElementById('blurInput').value = this.blurValue.toFixed();

                document.getElementById('periodInput').value = this.period;
                document.getElementById('numColorsInput').value = this.numColors.toFixed();
        }

        /**
         *
         * @param {HTMLInputElement} input
         * @param {string} name
         */
        settingsChanged(input, name) {

                switch(name){
                        case 'auto':
                                this.autoSetIter = input.checked;
                                document.getElementById('iterInput').disabled = input.checked;
                                this.setAutoIterations();
                                this.compileProgram();
                                this.render();
                                return;
                        case 'inverse':
                                this.renderInverse = input.checked;
                                this.compileProgram();
                                this.render();
                                return;
                        case 'gradient':
                                this.gradient = input.checked;
                                this.compileProgram();
                                this.render();
                                break;
                                
                                
                        case 'c1':
                                this.colors[0] = input.value;
                                this.colorsInt[0] = parseInt(input.value.slice(1), 16);
                                this.compileProgram();
                                this.render();
                                return;
                        case 'c2':
                                this.colors[1] = input.value;
                                this.colorsInt[1] = parseInt(input.value.slice(1), 16);
                                this.compileProgram();
                                this.render();
                                return;
                        case 'c3':
                                this.colors[2] = input.value;
                                this.colorsInt[2] = parseInt(input.value.slice(1), 16);
                                this.compileProgram();
                                this.render();
                                return;
                        case 'c4':
                                this.colors[3] = input.value;
                                this.colorsInt[3] = parseInt(input.value.slice(1), 16);
                                this.compileProgram();
                                this.render();
                                return;
                        case 'c5':
                                this.colors[4] = input.value;
                                this.colorsInt[4] = parseInt(input.value.slice(1), 16);
                                this.compileProgram();
                                this.render();
                                return;
                        case 'c6':
                                this.colors[5] = input.value;
                                this.colorsInt[5] = parseInt(input.value.slice(1), 16);
                                this.compileProgram();
                                this.render();
                                return;
                        case 'c7':
                                this.colors[6] = input.value;
                                this.colorsInt[6] = parseInt(input.value.slice(1), 16);
                                this.compileProgram();
                                this.render();
                                return;
                        case 'c8':
                                this.colors[7] = input.value;
                                this.colorsInt[7] = parseInt(input.value.slice(1), 16);
                                this.compileProgram();
                                this.render();
                                return;
                                
                                
                }

                let x = Math.floor(input.valueAsNumber);
                if (x < Number.parseInt(input.min))x = Number.parseInt(input.min);
                if (x > Number.parseInt(input.max))x = Number.parseInt(input.max);

                let y = input.valueAsNumber;
                if (y < Number.parseFloat(input.min))y = Number.parseFloat(input.min);
                if (y > Number.parseFloat(input.max))y = Number.parseFloat(input.max);

                switch(name){
                        case 'iter':
                                this.iterations = x;
                                break;
                        case 'lowRes':
                                this.lowRes = y;
                                break;
                        case 'dragSense':
                                this.dragSense = y;
                                break;
                        case 'scrollSense':
                                this.scrollSense = x;
                                break;
                        case 'blur':
                                this.blurValue = x;
                                this.updateBlur();
                                break;
                        case 'period':
                                this.period = y;
                                break;
                        case 'numColors':
                                this.numColors = x;
                                break;
                }
                
                this.compileProgram();
                this.render();
        }

        // Fit the canvas inside the window and center the set if needed
        setCanvasSize() {
                // Set canvas size and scale according to the device pixel ratio
                let dpr = window.devicePixelRatio || 1;
                if (this.resolutionScaling === this.lowRes && this.renderInverse) dpr *= 0.5;
                dpr *= this.resolutionScaling;
                this.gl.canvas.width = window.innerWidth * dpr;
                this.gl.canvas.height = window.innerHeight * dpr;
                this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
        }

        resetView() {
                // Set offsets that the MB set is in the middle of the screen
                const w = (this.gl.canvas.width) / screenXRatio;
                const h = (this.gl.canvas.height) / screenYRatio;
                const unit = Math.min(w, h);
                if (w >= h) {
                this.offsetX = -(w - h) / unit;
                this.offsetY = 0;
                } else {
                this.offsetY = -(h - w) / unit;
                this.offsetX = 0;
                }
        }

        // Create a buffer containing the corner vertices of the screen.
        createVertexBuffer() {
                const buffer = this.gl.createBuffer();
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
                this.gl.bufferData(this.gl.ARRAY_BUFFER,
                new Float32Array([
                        -1.0, 1.0,
                        1.0, 1.0,
                        -1.0, -1.0,
                        1.0, -1.0,
                ].map((n) => n)),
                this.gl.STATIC_DRAW);
                return buffer;
        }

        /**
         * Converts a point in screen space [0, width] x [0, height] to the point on the comlex plane
         *
         * @param {number} _x The x coordinate
         * @param {number} _y The y coordinate
         * @returns {r: number, i: number} The comlex number on the complex plane
         */
        screenToSpace(_x, _y) {
                const ret = { r: 0, i: 0 };

                let dpr = window.devicePixelRatio || 1;
                if (this.resolutionScaling === this.lowRes && this.renderInverse) dpr *= 0.5;
                dpr *= this.resolutionScaling;
                const w = (this.gl.canvas.width) / screenXRatio;
                const h = (this.gl.canvas.height) / screenYRatio;
                const unit = Math.min(w, h);
                const x = _x * dpr;
                const y = _y * dpr;

                ret.r = (((2 * x) / unit) - 2) / this.scaling + this.offsetX;
                ret.i = (-((2 * y) / unit) + 1.1) / this.scaling - this.offsetY;

                return ret;
        }

        /**
         * This function zooms in in a way that the center stays in the same point on the screen.
         * I do not know why but it does not work properly when the height is
         * bigger than the width of the screen, and a haven't managed to figure out why.
         * I have redone the transformation equations a couple of times but did not fix it.
         * Might be because WebGL's coordinate system start in the bottom left corner while the
         * browser's coordinate system's origo is in the upper left.
         *
         * @param {number} scalingFactor The factor to scale with
         * @param {number} _centerX The x coordinate of the center of the scaling in screen space
         * @param {number} _centerY The y coordinate of the center of the scaling in screen space
         */
        scaleAround(scalingFactor, _centerX, _centerY) {
                const newScaling = this.scaling * scalingFactor;
                let dpr = window.devicePixelRatio || 1;
                if (this.resolutionScaling === this.lowRes && this.renderInverse) dpr *= 0.5;
                dpr *= this.resolutionScaling;
                const w = (this.gl.canvas.width) / screenXRatio;
                const h = (this.gl.canvas.height) / screenYRatio;
                const unit = Math.min(h, w);
                const centerX = _centerX * dpr;
                const centerY = (_centerY) * dpr;

                this.offsetX = ((2 * centerX) / unit - 2)
                * ((1 / this.scaling) - (1 / newScaling)) + this.offsetX;

                this.offsetY = -(-(2 * centerY) / (unit) + 1.1)
                * ((1 / newScaling) - (1 / this.scaling)) + this.offsetY;

                this.scaling = newScaling;
        }

        /**
         * @param {MouseEvent} event
         */
        handleMouseDown(event) {
                event.preventDefault();

                this.mouseIsDown = true;
                // Drop the resolution while moving the view so that it does not lag
                this.resolutionScaling = this.lowRes;
                this.setCanvasSize();
        }

        /**
         * @param {MouseEvent} event
         */
        handleMouseUp(event) {
                event.preventDefault();

                this.mouseIsDown = false;
                // Set the resolution back to default
                this.resolutionScaling = 1;
                this.setCanvasSize();
                this.render();
        }

        /**
         * @param {TouchEvent} event
         */
        handleTouchStart(event) {
                this.mouseIsDown = true;

                event.preventDefault();

                // Store touches in the arrays for use in later touch events
                if (event.touches.length > 1) {
                if (event.touches.length === 2) {
                        // Save touches
                        this.touchIDs = [];
                        this.touchCoords = [];
                        this.touchIDs.push(event.touches[0].identifier);
                        this.touchIDs.push(event.touches[1].identifier);
                        this.touchCoords.push(
                        {
                        x: event.touches[0].clientX,
                        y: event.touches[0].clientY,
                        },
                        );
                        this.touchCoords.push(
                        {
                        x: event.touches[1].clientX,
                        y: event.touches[1].clientY,
                        },
                        );
                }
                if (event.touches.length > 2) {
                        this.touchIDs = [];
                        this.touchCoords = [];
                }
                return false;
                } if (event.touches.length === 1) {
                this.touchIDs = [event.touches[0].identifier];
                this.touchCoords = [{
                        x: event.touches[0].clientX,
                        y: event.touches[0].clientY,
                }];

                this.mouseIsDown = true;
                this.resolutionScaling = this.lowRes;
                this.setCanvasSize();
                }
                return false;
        }

        /**
        * Handles touch end events on the canvas
        *
        * @param {TouchEvent} event The event sent
        */
        handleTouchEnd(event) {
                event.preventDefault();

                // Remove or add touches to the arrays
                if (event.touches.length > 1) {
                if (event.touches.length === 2) {
                        // Save touches
                        this.touchIDs = [];
                        this.touchCoords = [];
                        this.touchIDs.push(event.touches[0].identifier);
                        this.touchIDs.push(event.touches[1].identifier);
                        this.touchCoords.push(
                        {
                        x: event.touches[0].clientX,
                        y: event.touches[0].clientY,
                        },
                        );
                        this.touchCoords.push(
                        {
                        x: event.touches[1].clientX,
                        y: event.touches[1].clientY,
                        },
                        );
                }
                if (event.touches.length > 2) {
                        this.touchIDs = [];
                        this.touchCoords = [];
                }
                return false;
                } if (event.touches.length === 1) {
                this.touchIDs = [event.touches[0].identifier];
                this.touchCoords = [{
                        x: event.touches[0].clientX,
                        y: event.touches[0].clientY,
                }];
                }
                if (event.touches.length === 0) {
                this.touchIDs = [];
                this.touchCoords = [];

                // If no more touches are present, set resolution back to normal
                this.mouseIsDown = false;
                this.resolutionScaling = 1;
                this.setCanvasSize();
                this.setAutoIterations();
                this.render();
                }
                this.mouseIsDown = false;

                return false;
        }

        setAutoIterations() {
                if (!this.autoSetIter) return;
                this.iterations = (this.scaling ** 0.25) * 50;
                this.compileProgram();
        }

        /**
        * Handles touch move events.
        *
        * @param {TouchEvent} event The event sent
        */
        handleTouchMove(event) {
                event.preventDefault();

                // Find the corresponding touches that are in the arrays
                if (event.touches.length === 2) {
                let touches = [];
                if ((event.touches.item(0)).identifier === this.touchIDs[0]) {
                        touches.push(event.touches.item(0));
                        touches.push(event.touches.item(1));
                } else {
                        touches.push(event.touches.item(1));
                        touches.push(event.touches.item(0));
                }
                touches = touches.map((t) => (
                        { x: t.clientX, y: t.clientY }));
                // If 2 touches are present, process the pinch zoom gesture
                this.processMultiTouchGesture(this.touchCoords, touches);
                this.touchCoords = touches;
                return false;
                }
                if (event.touches.length > 2) return false;

                // Now we only have 1 touches so do movement
                const movementX = event.touches[0].clientX - this.touchCoords[0].x;
                const movementY = event.touches[0].clientY - this.touchCoords[0].y;

                const origo = this.screenToSpace(0, 0);
                const movementC = this.screenToSpace(movementX, movementY);

                this.offsetX += (origo.r - movementC.r);
                this.offsetY += (origo.i - movementC.i);
                this.render();

                this.touchIDs = [event.touches[0].identifier];
                this.touchCoords = [{
                x: event.touches[0].clientX,
                y: event.touches[0].clientY,
                }];
                return false;
                }

        /**
        * Processes gestures with 2 touches present.
        * Looks at the distance between touches and by how much that
        * distance changed since the last update. Based on that, zooms in or out and moves the camera if movement is present too.
        *
        * @param {{x:number,y:number}[]} oldCoords The old coordinates of the touches
        * @param {{x:number,y:number}[]} newCoords The new coordinates of the touches
        */
        processMultiTouchGesture(oldCoords, newCoords) {
                const oldCenter = {
                x: oldCoords[1].x + oldCoords[0].x,
                y: oldCoords[1].y + oldCoords[0].y,
                };
                oldCenter.x *= (0.5);
                oldCenter.y *= (0.5);
                const newCenter = {
                x: newCoords[1].x + newCoords[0].x,
                y: newCoords[1].y + newCoords[0].y,
                };
                newCenter.x *= (0.5);
                newCenter.y *= (0.5);
                const oldLen = (((oldCoords[0].x - oldCoords[1].x) ** 2)
                + ((oldCoords[0].y - oldCoords[1].y) ** 2)) ** 0.5;
                const newLen = (((newCoords[0].x - newCoords[1].x) ** 2)
                + ((newCoords[0].y - newCoords[1].y) ** 2)) ** 0.5;
                const scalingFactor = Math.sqrt(newLen / oldLen);
                const middleCenter = {
                x: oldCenter.x + newCenter.x,
                y: oldCenter.y + newCenter.y,
                };
                middleCenter.x *= (0.5);
                middleCenter.y *= (0.5);
                const toMove = {
                x: newCenter.x - oldCenter.x,
                y: newCenter.y - oldCenter.y,
                };
                toMove.x *= (scalingFactor);
                toMove.y *= (scalingFactor);
                this.scaleAround(scalingFactor, middleCenter.x, middleCenter.y);

                const origo = this.screenToSpace(0, 0);
                const movementC = this.screenToSpace(toMove.x, toMove.y);

                this.offsetX += (origo.r - movementC.r);
                this.offsetY += (origo.i - movementC.i);
                // Rerender the iamge to take effect
                this.render();
        }

        /**
        * Mouse dragging
        *
        * @param {MouseEvent} event The event sent
        */
        handleMouseMove(event) {
                event.preventDefault();
                if (!this.mouseIsDown) return;

                // If the mouse is down (getting dragged), move the camera
                const origo = this.screenToSpace(0, 0);
                const movementC = this.screenToSpace(event.movementX, event.movementY);

                this.offsetX += (origo.r - movementC.r) * this.dragSense;
                this.offsetY += (origo.i - movementC.i) * this.dragSense;
                // Rerender to show the difference
                this.render();
        }

        /**
         * Scroll wheel
         *
         * @param {WheelEvent} event The incoming event
         */
        handleScroll(event) {
                event.preventDefault();

                // Find the amount to zoom with
                const scalingFactor = 1.001 ** (-event.deltaY * this.scrollSense);
                this.scaleAround(scalingFactor, event.clientX, event.clientY);

                // Drop resolution if needed
                if (this.resolutionScaling !== this.lowRes) {
                this.resolutionScaling = this.lowRes;
                this.setCanvasSize();
                }

                // Add a debounce effect to the resolution resetting with setTimeout
                if (this.zoomTimeoutID !== false) {
                clearTimeout(this.zoomTimeoutID);
                this.zoomTimeoutID = 0;
                }
                this.zoomTimeoutID = setTimeout(() => {
                this.resolutionScaling = 1;
                this.setCanvasSize();
                this.setAutoIterations();
                this.zoomTimeoutID = false;
                // Rerender with normal resolution
                this.render();
                }, 300);

                this.render();
        }


        updateBlur() {
                const canvas = document.getElementById('Canvas');
                const ctx = canvas.getContext('2d');
                const start = 'blur(';
                const mid = (this.blurValue / 20.0).toString();
                const end = 'px)';
                canvas.style.filter = start + mid + end;
                
        };

        /**
        * Generate code for the pixel shader that renders the image
        *
        * @param {number} iterations
        * @param {boolean} gradient
        * @param {number} period
        * @param {number} numColors
        * @param {Array<number>} colors
        * @param {boolean} inverse
        */
        static getRenderSource(iterations, gradient, period, numColors, colors, inverse = false) {

                let inverting = `
                                const int maxIter = ${Math.round(iterations)};
                                int iter;
                                for(int i = 1;i <= maxIter;i++) {
                                        float oldR = zR;
                                        zR = zR * zR - zI * zI + cR;
                                        zI = 2.0 * oldR * zI + cI;
                                        iter = i;
                                        if((zR * zR + zI * zI) > 4.0) {
                                                break;
                                        }
                                }

                                int bounded = 0;
                                if(iter == maxIter){
                                        bounded = 1;
                                }
                        
                                float result = float(iter) / 1000.0;
                                if(bounded == 1){
                `;
                if(inverse){
                        inverting = `
                                const int maxIter = ${Math.round(iterations)};
                                float result = 0.0;
                                int bounded = 1;
                                for(int i = 0;i < ${Math.round(iterations)};i++){
                                        float oldR = zR;
                                        zR = zR * zR - zI * zI + cR;
                                        zI = 2.0 * oldR * zI + cI;
                                        if((zR * zR + zI * zI) > result){
                                                result = (zR * zR + zI * zI);
                                                if(result > 4.0){
                                                        bounded = 0;
                                                        break;
                                                }
                                        }
                                }
                                
                                if(bounded == 0) {
                        `;
                }

                return `
                
                        precision highp float;
                        uniform vec2 resolution;
                        uniform float scaling;
                        uniform vec2 offsets;
                        
                        vec3 getRGB(in float result);
                        
                        void main() {
                                float unit = min(resolution.x / 1.3, resolution.y / 1.1);
                                float cR = ((2.0 * gl_FragCoord.x / unit) - 2.0) / scaling + offsets.x;
                                float cI = (-(2.0 * gl_FragCoord.y / unit) + 1.1) / scaling - offsets.y;
                                float zR = 0.0;
                                float zI = 0.0;
                                ` + inverting + `
                                        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                                }
                                else {
                                        vec3 color = getRGB(result * 15.0);
                                        gl_FragColor = vec4(color, 1.0);
                                }
                        }

                        // Convert the result to rgb
                        vec3 getRGB(in float result){

                                float R; float G; float B;

                                // Get the two colors and position of the result between them from 0.0 to 1.0
                                float x = result;
                                float cpp = float(${period}) / float(${Math.round(numColors)});
                                x = mod(x, float(${period}));
                                int i1 = int(floor(x / cpp));
                                int i2 = int(mod(float(i1 + 1), float(${Math.round(numColors)})));
                                x = mod(x, cpp) / cpp;

                                int col[8];
                                col[0] = ` + colors[0].toString() + `;
                                col[1] = ` + colors[1].toString() + `;
                                col[2] = ` + colors[2].toString() + `;
                                col[3] = ` + colors[3].toString() + `;
                                col[4] = ` + colors[4].toString() + `;
                                col[5] = ` + colors[5].toString() + `;
                                col[6] = ` + colors[6].toString() + `;
                                col[7] = ` + colors[7].toString() + `;

                                int c1 = col[0];
                                int c2 = col[1];
                                if(i1 == 0){
                                c1 = col[0];}else{if(i1 == 1){
                                c1 = col[1];}else{if(i1 == 2){
                                c1 = col[2];}else{if(i1 == 3){
                                c1 = col[3];}else{if(i1 == 4){
                                c1 = col[4];}else{if(i1 == 5){
                                c1 = col[5];}else{if(i1 == 6){
                                c1 = col[6];}else{if(i1 == 7){
                                c1 = col[7];}}}}}}}}
                                if(i2 == 0){
                                c2 = col[0];}else{if(i2 == 1){
                                c2 = col[1];}else{if(i2 == 2){
                                c2 = col[2];}else{if(i2 == 3){
                                c2 = col[3];}else{if(i2 == 4){
                                c2 = col[4];}else{if(i2 == 5){
                                c2 = col[5];}else{if(i2 == 6){
                                c2 = col[6];}else{if(i2 == 7){
                                c2 = col[7];}}}}}}}}

                                // Get RGB values of the two colors
                                float upper = 255.0;
                                float r1 = float(c1 / 65536) / upper;
                                float r2 = float(c2 / 65536) / upper;
                                float g1 = float(mod(float(c1 / 256), 256.0)) / upper;
                                float g2 = float(mod(float(c2 / 256), 256.0)) / upper;
                                float b1 = float(mod(float(c1), 256.0)) / upper;
                                float b2 = float(mod(float(c2), 256.0)) / upper;

                                if(${gradient} == true){
                                        R = r1 + x * (r2 - r1);
                                        G = g1 + x * (g2 - g1);
                                        B = b1 + x * (b2 - b1);
                                }else{
                                        R = r1;
                                        G = g1;
                                        B = b1;
                                }

                                return vec3(R, G, B);
                        }
                `;
        }
}

const renderer = new Display('Canvas');
renderer.render();

// eslint-disable-next-line no-unused-vars
function resetView() {
        
        // Reset scaling a center the MB set
        renderer.scaling = 1;
        renderer.resetView();
        renderer.setAutoIterations();
        // Reset resolution and rerender
        renderer.resolutionScaling = 1;
        renderer.setCanvasSize();
        renderer.render();
}

// Export and prompt the user to save a png image of the current content of the canvas
// eslint-disable-next-line no-unused-vars
function exportImage() {
        // Reset resolution to have a sharp image
        renderer.resolutionScaling = 1;
        renderer.setCanvasSize();
        // Rerender so that not an empty image will be exported
        renderer.render();
        // Create image data url from the canvas
        const url = renderer.cnv.toDataURL('image/png');

        // Create a download link in the html document for downloading the image
        const downloadLink = document.createElement('a');
        downloadLink.download = 'export.png';
        downloadLink.href = url;
        downloadLink.dataset.downloadurl = ['image/png', downloadLink.download, downloadLink.href].join(':');

        // Add the link to the document, click it virtually then remove it
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
}

// Event listeners for the input elements
document.getElementById('autoBox').onclick = function () {renderer.settingsChanged(this, 'auto');};
document.getElementById('inverseBox').onclick = function () {renderer.settingsChanged(this, 'inverse');};
document.getElementById('gradientBox').onclick = function () {renderer.settingsChanged(this, 'gradient');};
document.getElementById('iterInput').onchange = function () {renderer.settingsChanged(this, 'iter');};
document.getElementById('lowResInput').onchange = function () {renderer.settingsChanged(this, 'lowRes');};
document.getElementById('dragSenseInput').onchange = function () {renderer.settingsChanged(this, 'dragSense');};
document.getElementById('scrollSenseInput').onchange = function () {renderer.settingsChanged(this, 'scrollSense');};
document.getElementById('blurInput').onchange = function () {renderer.settingsChanged(this, 'blur');};

document.getElementById('periodInput').onchange = function () {renderer.settingsChanged(this, 'period');};
document.getElementById('numColorsInput').onchange = function () {renderer.settingsChanged(this, 'numColors');};

document.getElementById('c1Input').onchange = function () {renderer.settingsChanged(this, 'c1');};
document.getElementById('c2Input').onchange = function () {renderer.settingsChanged(this, 'c2');};
document.getElementById('c3Input').onchange = function () {renderer.settingsChanged(this, 'c3');};
document.getElementById('c4Input').onchange = function () {renderer.settingsChanged(this, 'c4');};
document.getElementById('c5Input').onchange = function () {renderer.settingsChanged(this, 'c5');};
document.getElementById('c6Input').onchange = function () {renderer.settingsChanged(this, 'c6');};
document.getElementById('c7Input').onchange = function () {renderer.settingsChanged(this, 'c7');};
document.getElementById('c8Input').onchange = function () {renderer.settingsChanged(this, 'c8');};

document.getElementById('resetButton').onclick = () => {resetView();};
document.getElementById('saveButton').onclick = () => {exportImage();};