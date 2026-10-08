#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform vec4 uSpriteColor;
uniform sampler2D uDiffuse;

uniform bool  uFogUse;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3  uFogColor;

void main(void) {
	// Drop a texture's black background, not a layer tinted black: a white
	// shape coloured (0, 0, 0) is a shadow or a print, drawn by alpha blending.
	vec4 texel = texture( uDiffuse, vTextureCoord.st );
	if ( texel.a == 0.0 || (texel.r == 0.0 && texel.g == 0.0 && texel.b == 0.0) ) {
		discard;
	}
	fragColor = texel * uSpriteColor;
	if ( fragColor.a == 0.0 ) {
		discard;
	}

	if ( uFogUse ) {
		float depth     = gl_FragCoord.z / gl_FragCoord.w;
		float fogFactor = smoothstep( uFogNear, uFogFar, depth );
		fragColor    = mix( fragColor, vec4( uFogColor, fragColor.w ), fogFactor );
	}
}