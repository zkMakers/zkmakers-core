const nrc = require('node-run-cmd');
const fs = require('fs');

const flatten = async (contract) => {
    return new Promise(async (resolve) => {
        let data = '';
        await nrc.run('truffle-flattener contracts/'+contract, { onData: (info) => data += info });
        resolve(data);
    });
}

const cleanFlatten = (code) => {
    code = code.replace(/\/\/ SPDX-License-Identifier: MIT/g, '');

    return code.replace(/\n/, '\n\n// SPDX-License-Identifier: MIT');
}

(async () => {
    const contracts = fs.readdirSync('./contracts');

    for(const contract of contracts) {
        if (contract.endsWith('.sol')) {
            console.log('Flattening', contract);
            const flattened = await flatten(contract);
            fs.writeFileSync('./dist/'+contract, cleanFlatten(flattened));
        }
    }
    console.log('Done! 🚀');
})();