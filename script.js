async function main(canvas, root, fps) {
    fps = fps || 30;
    root = root || ".";

    await loadTwgl();

    const dimensions = [1000, 1000];

    canvas.width = dimensions[0];
    canvas.height = dimensions[1];
    const gl = canvas.getContext("webgl2"/*, {premultipliedAlpha: false}*/);
    if (!gl)
        throw new Error("Could not initialize webgl2 context! Does your browser support webgl2?");
    enableGlExts(gl);

    const fragShader = await getFile(root + "/compute.frag.c");
    const programInfo = twgl.createProgramInfo(gl, [vs, fragShader]);

    const bufferInfo = twgl.createBufferInfoFromArrays(gl, bufferArrays);
    setupProgram(gl, programInfo, bufferInfo);

    const fbs = new FrameBufferManager(gl, dimensions);

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
            return;
        }

        const curr_width = x_span();
        const final_width = curr_width * zoom_factor;
        domain[0] = center[0] - (final_width / 2);
        domain[1] = center[0] + (final_width / 2);

        const curr_height = y_span();
        const final_height = curr_height * zoom_factor;
        range[0] = center[0] - (final_height / 2);
        range[1] = center[0] + (final_height / 2);


        reset = true;
    }

    function zoom_handler(e, zoom_in) {
        const rect = canvas.getBoundingClientRect();
        const mousePos =  [
          (e.clientX - rect.left) / rect.width,
          (rect.height - (e.clientY - rect.top)) / rect.height, // flip y-axis for gl coords
        ];

        console.log(mousePos, domain, range);
        mousePos[0] = x_span() * mousePos[0] + domain[0];
        mousePos[1] = y_span() * mousePos[1] + range[0];
        console.log(mousePos);
        zoom(mousePos, zoom_in ? 0.5 : 8);
    }

    canvas.addEventListener("click", (e) => { console.log("click"); zoom_handler(e, true) });

    canvas.addEventListener("dblclick", (e) => { console.log("dblclick"); zoom_handler(e, false); });

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
            u_texture: fbs.src(),
            u_domain: domain,
            u_range: range,
            u_reset: reset,
        });

        fbs.bind_dst();

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
            u_texture: fbs.dst(),
        });

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        render(gl);
        gl.finish();

        fbs.flipflop();

        steps--;
        if (steps) {
            lastRender = time;
            requestAnimationFrame(step);
        }
    }

    requestAnimationFrame(step);
}
