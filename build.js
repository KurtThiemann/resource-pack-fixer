import * as esbuild from 'esbuild'

const buildOptions = {
    bundle: true,
    sourcemap: 'linked',
    outdir: './dist/',
    target: "safari12",
    legalComments: "inline",
    entryPoints: ['./index.js'],
    keepNames: true,
    minify: true,
}

esbuild.build(buildOptions);
