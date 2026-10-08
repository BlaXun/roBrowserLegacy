#version 300 es
precision highp float;

in float aCorner;
in vec2 aTextureCoord;

out vec2 vTextureCoord;

uniform mat4 uModelViewMat;
uniform mat4 uProjectionMat;
uniform vec3 uCorners[4];

void main(void) {
	gl_Position = uProjectionMat * uModelViewMat * vec4(uCorners[int(aCorner)], 1.0);
	vTextureCoord = aTextureCoord;
}
