#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform sampler2D uDiffuse;
uniform vec4 uColor;
uniform bool uDarken;

void main(void) {
	vec4 texColor = texture(uDiffuse, vTextureCoord);

	if (texColor.a < 0.01) {
		discard;
	}

	if (uDarken) {
		float k = max(max(texColor.r, texColor.g), texColor.b) * uColor.a;
		fragColor = vec4(k, k, k, 1.0);
		return;
	}
	fragColor = texColor * uColor;
}