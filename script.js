async function loadTwgl() {
    const p = new Promise((resolve) => {
        const script = document.createElement("script");
        script.type = "text/javascript";
        script.src = "https://twgljs.org/dist/4.x/twgl-full.min.js";
        script.onreadystatechange = resolve;
        script.onload = resolve;
        document.head.appendChild(script);
    });
    return p;
}

_fileCache = {}
async function getFile(url) {
    if (url in _fileCache)
        return _fileCache[url];

    const resp = await fetch(url);
    if (resp.status !== 200)
        throw("Could not find shader " + url);

    let fileContents = "";
    const reader = resp.body.getReader();
    done = false;
    while (!done) {
        let fileBody = await reader.read();
        if (!fileBody.value) {
            done = true;
        } else {
            fileContents += String.fromCharCode.apply(null, fileBody.value);
        }
    }
    _fileCache[url] = fileContents;
    return fileContents;
}

/**
 * @param gl webgl2 instance
 * @param dimensions [width, height] tuple for texture dimensions
 * @param data - can be null, if not will be used as the source for the texture
 */
function createTexture(gl, dimensions, data) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0, // level
        gl.RGBA32F, // internal format
        dimensions[0], // width
        dimensions[1], // height
        0, // border
        gl.RGBA, // format
        gl.FLOAT, // type
        data, /* source */);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    return tex;
}

function render(gl) {
    // draw the quad (2 triangles)
    const offset = 0;
    const numVertices = 6;
    gl.drawArrays(gl.TRIANGLES, offset, numVertices);
}

function setupProgram(gl, programInfo, bufferInfo) {
    gl.useProgram(programInfo.program);

    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);

}

function enableGlExts(gl) {
    gl.getExtension('OES_texture_float');        // just in case
    gl.getExtension('OES_texture_float_linear');
    ext = gl.getExtension('EXT_color_buffer_float');
    if (!ext) {
        alert("no ext color...");
        throw new Error("!");
    }
}

const vs = `
    #version 300 es
    in vec4 position;
    void main() {
      gl_Position = position;
    }`;

const bufferArrays = {
    position: {
        data: [
          -1, -1,
           1, -1,
          -1,  1,
          -1,  1,
           1, -1,
           1,  1,
        ],
        numComponents: 2,
    },
};

var gl = null;
async function main(canvas, root, fps) {
    fps = fps || 30;
    root = root || ".";

    await loadTwgl();

    const dimensions = [1000, 1000];

    canvas.width = dimensions[0];
    canvas.height = dimensions[1];
    gl = canvas.getContext("webgl2"/*, {premultipliedAlpha: false}*/);
    if (!gl)
        throw new Error("Could not initialize webgl2 context! Does your browser support webgl2?");
    enableGlExts(gl);

    const fragShader = await getFile(root + "/compute.frag.c");
    const programInfo = twgl.createProgramInfo(gl, [vs, fragShader]);

    const bufferInfo = twgl.createBufferInfoFromArrays(gl, bufferArrays);
    setupProgram(gl, programInfo, bufferInfo);

    const computeDsts = [createTexture(gl, dimensions, null), createTexture(gl, dimensions, null)];
    const fb = gl.createFramebuffer();

    const domain = new Float32Array([-2, 2]);
    const range = new Float32Array([-2, 2]);

    let reset = false;

    function x_span() {
        return domain[1] - domain[0];
    }

    function y_span() {
        return range[1] - range[0];
    }

    // Zoom in by 0.75x
    function zoom(center, zoom_factor) {
        if (center[0] < domain[0] || center[0] > domain[1] ||
                center[1] < range[0] || center[1] > range[1]) {
            console.log("?!?!", center, domain, range);
            console.log(center[0] < domain[0]);
            console.log(center[0] > domain[1]);
            console.log(center[1] < range[0]);
            console.log(center[1] > range[1]);
            return;
        }

        const curr_width = x_span();
        const final_width = curr_width * zoom_factor;
        console.log(curr_width, "->", final_width);
        domain[0] = center[0] - (final_width / 2);
        domain[1] = center[0] + (final_width / 2);

        const curr_height = y_span();
        const final_height = curr_height * zoom_factor;
        console.log(curr_height, "->", final_height);
        range[0] = center[0] - (final_height / 2);
        range[1] = center[0] + (final_height / 2);

        console.log(center, domain, range);

        reset = true;
    }

    canvas.addEventListener("mousedown", (e) => {
        const rect = canvas.getBoundingClientRect();
        const mousePos =  [
          (e.clientX - rect.left) / rect.width,
          (canvas.height - (e.clientY - rect.top)) / rect.height, // flip y-axis for gl coords
        ];

        console.log(mousePos);
        mousePos[0] = x_span() * mousePos[0] + domain[0];
        mousePos[1] = y_span() * mousePos[1] + range[0];
        console.log(mousePos);
        zoom(mousePos, e.buttons == 1 ? 0.5 : 2);
    });

    canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); });

    let counter = 0;
    function src() {
        return computeDsts[counter];
    }

    function dst() {
        return computeDsts[(counter + 1) % 2];
    }

    function flipflop() {
        counter = counter + 1;
        counter %= 2;
    }

    let lastRender = 0;
    const mspf = 1000/fps;

    const max_steps = 10000;
    let steps = max_steps;

    function step(time) {
        if ((time - lastRender) < mspf) {
            requestAnimationFrame(step);
            return;
        }

        // Set up parameters for compute
        twgl.setUniforms(programInfo, {
            u_width: dimensions[0],
            u_height: dimensions[1],
            u_render: 0,
            u_texture: src(),
            u_domain: domain,
            u_range: range,
            u_reset: reset,
        });

        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst(), 0 /* level */);
        gl.finish();

        render(gl);
        gl.finish();
        if (reset) {
            steps = max_steps;
            reset = false;
        }

        // Set up parameters for render
        twgl.setUniforms(programInfo, {
            u_width: dimensions[0],
            u_height: dimensions[1],
            u_render: 1,
            u_texture: dst(),
        });

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        render(gl);
        gl.finish();

        flipflop();

        steps--;
        if (steps) {
            lastRender = time;
            requestAnimationFrame(step);
        }
    }

    requestAnimationFrame(step);
}
