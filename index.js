const program = require( 'commander' );
const fs = require( 'fs' );
const PNG = require( 'pngjs' ).PNG;

program
	.version( '0.1.0' )
	.option( '-i, --input <file>', 'Input cubemap image' )
	.option( '-o, --output [file]', 'Output cubemap image' )
	.option( '-w, --width <n>', 'Output cubemap size', parseInt )
	.option( '-h, --height <n>', 'Output cubemap height', parseInt )
	.parse( process.argv );

const W = program.width || 2048;
const H = program.height || 1024;

const out = program.output || 'out.png';

const EquiCoordToPolar = (x, y) => {
	const xNorm = ( 2 * x / W ) - 1;
	const yNorm = 1 - ( 2 * y / H );

	const theta = xNorm * Math.PI;
	const phi = Math.asin( yNorm );

	return [theta, phi];
};

const PolarToUnitVector = (theta, phi) => {
	const x = Math.cos( phi ) * Math.cos( theta );
	const y = Math.sin( phi );
	const z = Math.cos( phi ) * Math.sin( theta );

	return [x, y, z];
};

const DotProduct = (a, b) => {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
};

const Normalize = (a) => {
	const len = Math.sqrt( DotProduct( a, a ) );
	return [a[0] / len, a[1] / len, a[2] / len];
};

const Mul = (a, scalar) => {
	return [a[0] * scalar, a[1] * scalar, a[2] * scalar];
};

SIDE_BACK = 1;
SIDE_LEFT = 5;
SIDE_FRONT = 0;
SIDE_RIGHT = 4;
SIDE_TOP = 2;
SIDE_BOTTOM = 3;

const IntersectRayWithPlane = (side, normal, p0, ray) => {
	const denom = DotProduct( normal, ray );
	if( Math.abs( denom ) > 0.0000001 ) {
		const t = DotProduct( p0, normal ) / denom;
		
		if( t >= 0 ) {
			const newVec = Mul(ray, t);
			if( side === SIDE_LEFT ) {
				if( newVec[0] >= -1 && newVec[0] <= 1 && newVec[1] >= -1 && newVec[1] <= 1 ) {
					return [(newVec[0] + 1) / 2, (newVec[1] + 1) / 2];
				}
			} else if( side === SIDE_RIGHT ) {
				if( newVec[0] >= -1 && newVec[0] <= 1 && newVec[1] >= -1 && newVec[1] <= 1 ) {
					return [1 - (newVec[0] + 1) / 2, (newVec[1] + 1) / 2];
				}
			} else if( side === SIDE_FRONT ) {
				if( newVec[1] >= -1 && newVec[1] <= 1 && newVec[2] >= -1 && newVec[2] <= 1 ) {
					return [(newVec[2] + 1) / 2, (newVec[1] + 1) / 2];
				}
			} else if( side === SIDE_BACK ) {
				if( newVec[1] >= -1 && newVec[1] <= 1 && newVec[2] >= -1 && newVec[2] <= 1 ) {
					return [1 - (newVec[2] + 1) / 2, 1 - (newVec[1] + 1) / 2];
				}
			} else if( side === SIDE_TOP ) {
				if( newVec[0] >= -1 && newVec[0] <= 1 && newVec[2] >= -1 && newVec[2] <= 1 ) {
					return [1 - (newVec[0] + 1) / 2, 1 - (newVec[2] + 1) / 2];
				}
			} else if( side === SIDE_BOTTOM ) {
				if( newVec[0] >= -1 && newVec[0] <= 1 && newVec[2] >= -1 && newVec[2] <= 1 ) {
					return [(newVec[0] + 1) / 2, (newVec[2] + 1) / 2];
				}
			}
		}
	}
};

const MV = (vec) => {
	return [-vec[0], -vec[1], -vec[2]];
};

const IntersectRayWithBoxes = (ray) => {
	let t;

	const boxes = [
		[1, 0, 0],
		[-1, 0, 0],
		[0, 1, 0],
		[0, -1, 0],
		[0, 0, 1],
		[0, 0, -1],
	];

	for( let i = 0; i < boxes.length; i++ ) {
		xy = IntersectRayWithPlane(i, MV(boxes[i]), boxes[i], Normalize(ray));
		if( xy !== undefined ) {
			return [i, xy[0], xy[1]];
		}
	}
};

const SideXYToCubemap = (side, x, y) => {
	let newY, newX;
	switch(side) {
		case SIDE_BACK:
			newY = (1/3) + y * (1/3);
			return [x * 0.25, newY];
		case SIDE_LEFT:
			newY = (2/3) - y * (1/3);
			return [0.25 + x * 0.25, newY];
		case SIDE_FRONT:
			newY = (2/3) - y * (1/3);
			return [0.5 + x * 0.25, newY];
		case SIDE_RIGHT:
			newY = (2/3) - y * (1/3);
			return [0.75 + x * 0.25, newY];
		case SIDE_TOP:
			newY = y * ( 1/3 );
			newX = 0.5 - x * 0.25;
			return [newX, newY];
		case SIDE_BOTTOM:
			newY = (2/3) + y * ( 1/3 );
			newX = 0.25 + x * 0.25;
			return [newX, newY];
	}
};

fs.createReadStream( program.input )
.pipe( new PNG({
	filterType: 4
}) )
.on( 'parsed', function() {
	const png = this;

	const outPNG = new PNG( {
		width: W,
		height: H,
		colorType: 2,
		inputHasAlpha: false
	});

	for( let j = 0; j < H; j++ ) {
		for( let i = 0; i < W; i++ ) {
			const angs = EquiCoordToPolar( i, j );
			const ray = PolarToUnitVector( angs[0], angs[1] );
			const sxc = IntersectRayWithBoxes( ray );
			const xy = SideXYToCubemap( sxc[0], sxc[1], sxc[2] );
			
			const sampleX = Math.floor( xy[0] * png.width );
			const sampleY = Math.floor( xy[1] * png.height );

			const idx = (png.width * sampleY + sampleX) << 2;
			const oidx = (W * j + i) * 3;

			outPNG.data[oidx] = png.data[idx];
			outPNG.data[oidx + 1] = png.data[idx + 1];
			outPNG.data[oidx + 2] = png.data[idx + 2];
		}
	}

	outPNG.pack().pipe( fs.createWriteStream( program.output ) );
} );