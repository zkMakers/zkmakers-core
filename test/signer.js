class Signer {
    constructor(web3, signerPrivateKey) {
        this.web3 = web3;
        this.signerPrivateKey = signerPrivateKey;
    }

    async createSignature(wallet, points, proofTime, poolAddress,uidHash) {
        const nonce = this.generateNonce();
        const finalPoints = this.web3.utils.toWei(points + '', 'ether');

        const hash = this.web3.utils.soliditySha3(
            { type: 'address', value: wallet },
            { type: 'uint256', value: finalPoints },
            { type: 'uint256', value: nonce },
            { type: 'uint256', value: proofTime },
            { type: 'address', value: poolAddress },
            { type: 'bytes32', value: uidHash }
        );

        const sig = await this.sign(hash);

        return {
            finalPoints: finalPoints,
            proof: sig,
            nonce: nonce,
            proofTime: proofTime,
            uidHash: uidHash
        };
    }

    async sign(hash) {
        // Or await this.web3.eth.personal.sign(hash, signerAddress)
        return (await this.web3.eth.accounts.sign(hash, this.signerPrivateKey)).signature;
    }

    generateNonce() {
        return Date.now().toFixed(0) + Math.floor(Math.random() * (10 ** 14));
    }
}
module.exports = Signer;