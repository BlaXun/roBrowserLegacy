#version 300 es
precision highp float;

// AuraBatch.js puts its effect's defines here: FOG, DISCARD_CLEAR,
// DISCARD_BLACK, DARKEN. Each matches what that effect's own shader does.

in vec2 vTextureCoord;
flat in vec4 vColor;
out vec4 fragColor;

uniform sampler2D uDiffuse;
uniform bool uDarken;

uniform bool  uFogUse;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3  uFogColor;

void main(void) {
	vec4 texColor = texture(uDiffuse, vTextureCoord);

#ifdef DISCARD_CLEAR
	if (texColor.a < 0.01) {
		discard;
	}
#endif

#ifdef DISCARD_BLACK
	if (texColor.r < 0.01 && texColor.g < 0.01 && texColor.b < 0.01) {
		discard;
	}
#endif

#ifdef DARKEN
	if (uDarken) {
		float k = max(max(texColor.r, texColor.g), texColor.b) * vColor.a;
		fragColor = vec4(k, k, k, 1.0);
		return;
	}
#endif

	fragColor = texColor * vColor;

#ifdef FOG
	if (uFogUse) {
		float depth = gl_FragCoord.z / gl_FragCoord.w;
		float fogFactor = smoothstep(uFogNear, uFogFar, depth);
		fragColor = mix(fragColor, vec4(uFogColor, fragColor.w), fogFactor);
	}
#endif
}
