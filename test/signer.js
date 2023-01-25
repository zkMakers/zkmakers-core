
class Signer {
    constructor(web3, signerPrivateKey) {
        this.web3 = web3;
        this.signerPrivateKey = signerPrivateKey;
        this.splitSignature = require('ethers/lib/utils').splitSignature;
    }

    async createSignature(wallet, points, proofTime, poolAddress,uidHash) {
        const nonce = this.generateNonce();
        const finalPoints = this.web3.utils.toWei(points + '', 'ether');


        const ethers = require('ethers').ethers;
        const ethersWallet = new ethers.Wallet(this.signerPrivateKey);

        const signer = ethersWallet.connect(web3.defaultProvider);

        const signature = await signer._signTypedData(
            {
                name: "LiquidMiners",
                version: "1",
                chainId: '1',
                verifyingContract: poolAddress
            },
            {
                Proof: [
                    {name:"senderAddress",type:"address"},
                    {name:"totalPoints",type:"uint256"},
                    {name:"nonce", type:"uint256"},
                    {name:"lastProofTime", type:"uint256"},
                    {name:"poolAddress", type:"address"},
                    {name:"uidHash", type:"bytes32"}
                ],
            },
            {
                senderAddress: wallet,
                totalPoints: finalPoints,
                nonce: nonce,
                lastProofTime: proofTime.toString(),
                poolAddress: poolAddress,
                uidHash: uidHash
            }
        );
        return {
            finalPoints: finalPoints,
            proof: signature,
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