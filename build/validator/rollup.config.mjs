import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import path from 'path';
import typescript from 'rollup-plugin-typescript2';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export default {
    input: [path.join(__dirname, './src/contract-validator.ts')],
    output: {
        file: path.join(__dirname, '../validator.js'),
        format: 'umd',
        name: 'Validator'
    },
    plugins: [typescript({
        tsconfig: path.join(__dirname, "./rollup.tsconfig.json"),
        declaration: false
    }), resolve({
        extensions: ['.js', '.ts'],
        moduleDirectory: ['node_modules']
    }), replace({
        'global.contract': "global.Contract",
        ' Buffer': " buffer.Buffer",
        "${Buffer.from": "${buffer.Buffer.from",
        delimiters: ['', '']
    })],
    external: ['bignumber.js', 'lodash', '../../contract'],

};