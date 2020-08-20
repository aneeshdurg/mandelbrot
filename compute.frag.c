#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
precision highp int;
#else
precision mediump float;
precision mediump int;
#endif

#define PI 3.1415926538

uniform float u_width;
uniform float u_height;
uniform int u_render;
uniform sampler2D u_texture;

out vec4 color_out;

float isGEq(int a, int b) {
    return sign(sign(float(a) - float(b)) + 1.0);
}

float isGEq(float a, float b) {
    return sign(sign(a - b) + 1.0);
}

void main() {
    if (u_render == 1) {
        vec4 value = texelFetch(u_texture, ivec2(gl_FragCoord.xy), 0);
        if (!(isnan(value.r) || isnan(value.g))) {
            color_out = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }

        // All of this hsl color stuff is pretty arbitrary and constants were
        // chose for pretty colors
        float X = 100.0;
        float n = min(X, value.b);
        float ratio = n / X;
        float log_ratio = log(0.5 * n) / log(X);

        float h = 2.5 * log_ratio * 360.0;
        if (h >= 360.0)
            h -= 360.0;

        float s = 0.75;

        float l = 2.0 * log_ratio;

        // Finally we convert HSL to RGB
        // https://www.rapidtables.com/convert/color/hsl-to-rgb.html

        float c = (1.0 - abs(2.0 * l - 1.0)) * s;
        float x = c * (1.0 - float(abs(int(h / 60.0) % 2 - 1)));
        float m = l - c / 2.0;

        vec3 prime = vec3(0.0, 0.0, 0.0);

        if (h >= 0.0 && h < 60.0)
            prime = vec3(c, x, 0.0);
        else if (h >= 60.0 && h < 120.0)
            prime = vec3(x, c, 0.0);
        else if (h >= 120.0 && h < 180.0)
            prime = vec3(0.0, c, x);
        else if (h >= 180.0 && h < 240.0)
            prime = vec3(0.0, x, c);
        else if (h >= 240.0 && h < 300.0)
            prime = vec3(x, 0.0, c);
        else
            prime = vec3(c, 0.0, x);

        color_out = vec4(prime.r + m, prime.g + m, prime.b + m, 1.0);
        return;
    }

    // scale coords to [-2, 2]x[-2, 2]
    float c_real = 4.0 * (float(gl_FragCoord.x) / u_width) - 2.0;
    float c_imag = 4.0 * (float(gl_FragCoord.y) / u_height) - 2.0;

    float z_real = 0.0;
    float z_imag = 0.0;

    vec4 value = texelFetch(u_texture, ivec2(gl_FragCoord.xy), 0);
    z_real = value.r;
    z_imag = value.g;

    if (isnan(z_real) || isnan(z_imag)) {
        color_out = vec4(z_real, z_imag, value.b, 1.0);
        return;
    }

    // mandelbrot equation
    //     z_{n+1} = z_n^2 + c
    // Seperating the real and imaginary parts:
    //     a_{n+1} + b_{n+1} * i = (a_n + b_n * i)^2 + c_a + c_b * i
    //     a_{n+1} + b_{n+1} * i = a_n^2 - b_n^2 + 2 * a_n * b_n * i + c_a + c_b * i
    //
    //     a_{n+1} = a_n^2 - b_n^2 + c_a
    //     b_{n+1} = 2 * a_n * b_n + c_b

    // compute the real part of the mandelbrot equation:
    float res_real = z_real * z_real - z_imag * z_imag + c_real;
    float res_imag = 2.0 * z_real * z_imag + c_imag;

    color_out = vec4(res_real, res_imag, value.b + 1.0, 1.0);
}
