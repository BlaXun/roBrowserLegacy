#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform sampler2D uDiffuse;
uniform float uAlpha;

void main(void) {
	vec4 texel = texture(uDiffuse, vTextureCoord);
	fragColor = vec4(texel.rgb, texel.a * uAlpha);

	if (fragColor.a == 0.0) {
		discard;
	}
}
